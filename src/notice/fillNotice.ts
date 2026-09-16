// Browser-side fill for a School of Hope Building Notice. This is the exact
// counterpart of the skill's scripts/fill_notice.py: it opens a district
// template .docx (a zip), substitutes the {{TOKENS}} in word/document.xml with
// the caller's values, and hands back a filled .docx as a Blob. The templates
// carry the KIPP letterhead and the scanned signature as embedded media, so we
// never touch those; only the eleven text tokens change.
//
// Like the Python script, this REFUSES to produce a document if a token is left
// unresolved (template drift) rather than ship a broken legal filing. The values
// themselves come from noticeData.ts, which sources every figure from the tool's
// current data. No value is invented here.
//
// fflate is imported dynamically by the one caller so the zip codec and the
// template bytes only load when an operator actually generates a notice, never
// in the main bundle. No em dashes in this file.

import mdcpsTemplateUrl from "./templates/mdcps.docx?url";
import browardTemplateUrl from "./templates/broward.docx?url";

export type NoticeDistrict = "MDCPS" | "Broward";

// The eleven facility-specific fields, keyed to the {{TOKENS}} baked into both
// templates. Order and names match the Python script's TOKENS map exactly.
export interface NoticeFields {
  date: string;
  facility_name_upper: string;
  facility_address: string;
  facility_name_body: string;
  start_year: string;
  report_year: string;
  utilization: string;
  capacity: string;
  projected_enrollment: string;
  plp_list_year: string;
  plp_list: string;
  // The site's eligibility clause, injected before "within a five mile radius..."
  // in the template. For an Opportunity-Zone site it reproduces the original OZ +
  // attendance-zone wording; for a 5-mile-only site it is empty, so the sentence
  // asserts only the (true) 5-mile basis instead of a false OZ claim. May be "".
  siting_basis: string;
}

// Fields that are allowed to be empty (everything else must be filled). The
// siting basis is legitimately empty for a 5-mile-only site.
const ALLOW_EMPTY = new Set<keyof NoticeFields>(["siting_basis"]);

const TOKENS: Record<keyof NoticeFields, string> = {
  date: "{{DATE}}",
  facility_name_upper: "{{FACILITY_NAME_UPPER}}",
  facility_address: "{{FACILITY_ADDRESS}}",
  facility_name_body: "{{FACILITY_NAME_BODY}}",
  start_year: "{{START_YEAR}}",
  report_year: "{{REPORT_YEAR}}",
  utilization: "{{UTILIZATION}}",
  capacity: "{{CAPACITY}}",
  projected_enrollment: "{{PROJECTED_ENROLLMENT}}",
  plp_list_year: "{{PLP_LIST_YEAR}}",
  plp_list: "{{PLP_LIST}}",
  siting_basis: "{{SITING_BASIS}}",
};

const TEMPLATE_URL: Record<NoticeDistrict, string> = {
  MDCPS: mdcpsTemplateUrl,
  Broward: browardTemplateUrl,
};

// Values are injected into XML text nodes, so any &, <, > in a value (a school
// name, an address) must be escaped or it corrupts the document.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The parts of a .docx that can hold body/header text. Tokens live in
// document.xml today; header1.xml is filled too so a token moved into the
// letterhead in a future template still resolves.
const TEXT_PARTS = ["word/document.xml", "word/header1.xml"];

export interface FillResult {
  blob: Blob;
  filename: string;
}

// Fill the district template with `fields` and return a downloadable .docx.
// Throws if a required field is blank or a token is left unresolved, mirroring
// the Python script's guardrails so a bad document can never silently ship.
export async function fillNotice(district: NoticeDistrict, fields: NoticeFields): Promise<FillResult> {
  const missing = (Object.keys(TOKENS) as Array<keyof NoticeFields>).filter(
    (k) => !ALLOW_EMPTY.has(k) && !String(fields[k] ?? "").trim(),
  );
  if (missing.length) {
    throw new Error("Missing required fields: " + missing.join(", "));
  }

  const url = TEMPLATE_URL[district];
  const buf = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Could not load the ${district} template (${r.status}).`);
    return r.arrayBuffer();
  });

  const { unzipSync, zipSync, strToU8, strFromU8 } = await import("fflate");
  const zip = unzipSync(new Uint8Array(buf));

  const replaced = new Set<keyof NoticeFields>();
  for (const part of TEXT_PARTS) {
    const bytes = zip[part];
    if (!bytes) continue;
    let xml = strFromU8(bytes);
    for (const key of Object.keys(TOKENS) as Array<keyof NoticeFields>) {
      const tok = TOKENS[key];
      if (xml.includes(tok)) {
        xml = xml.replace(new RegExp(escapeRegExp(tok), "g"), escapeXml(String(fields[key])));
        replaced.add(key);
      }
    }
    zip[part] = strToU8(xml);
  }

  const leftover = (Object.keys(TOKENS) as Array<keyof NoticeFields>).filter((k) => !replaced.has(k));
  if (leftover.length) {
    throw new Error(
      "Template drift: these tokens were not found in the template: " +
        leftover.map((k) => TOKENS[k]).join(", "),
    );
  }

  // Guard against any stray token the loop above did not know about.
  for (const part of TEXT_PARTS) {
    const bytes = zip[part];
    if (bytes && strFromU8(bytes).includes("{{")) {
      throw new Error("An unresolved {{token}} remains in the generated notice.");
    }
  }

  const out = zipSync(zip);
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const safe = fields.facility_name_upper
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
  const filename = `SOH Building Notice - ${district} - ${safe}.docx`;
  return { blob, filename };
}

// User-initiated save of the generated notice (mirrors downloadCsv in data/csv).
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
