// The "Prepare building notice" dialog. It takes the eligibility facts the
// inspector already derived for a co-location candidate, pre-fills the eleven
// (plus one) notice fields from the tool's current data via buildNotice, and
// lets the operator confirm the few genuinely human values (send date, target
// start year, projected enrollment) before generating the .docx in the browser.
//
// This is a LEGAL FILING, so the dialog leads with that: every value is shown
// and editable, warnings (stale vintage, missing figures, siting basis) are
// surfaced up top, and the footer recommends counsel review. Generation itself
// is fillNotice (the browser twin of the skill's Python), which refuses to emit
// a document with an unresolved token. No em dashes in this file.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, TextInput, Checkbox, InlineNotification, Stack } from "@carbon/react";
import type { CountyName } from "../data/types";
import { buildNotice, type NoticeSourceInput } from "./noticeData";
import { fillNotice, downloadBlob, type NoticeFields } from "./fillNotice";
import "./NoticeDialog.carbon.css";

const DEFAULT_START_YEAR = "2027-28";
const BLANK = "__________";
const FIGURE_KEYS: Array<keyof NoticeFields> = ["utilization", "capacity", "projected_enrollment"];

export interface NoticeFacility {
  name: string;
  county: CountyName;
  address: string;
  utilizationPct: number | null;
  availableStations: number | null;
  fishVintage: string | null;
  anchors: Array<{ name: string; miles: number }>;
  inOZ: boolean;
}

function today(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

const BASIS_COPY: Record<string, { kind: "info" | "warning"; title: string; text: string }> = {
  "oz+plp": {
    kind: "info",
    title: "Siting basis: Opportunity Zone and 5-mile PLP",
    text: "The site is in an Opportunity Zone and within 5 miles of a PLP school. The standard letter applies unchanged.",
  },
  "plp-only": {
    kind: "info",
    title: "Siting basis: 5-mile PLP pathway",
    text: "The site is NOT in an Opportunity Zone. The notice asserts only the 5-mile PLP basis; the OZ sentence is omitted automatically.",
  },
  "oz-only": {
    kind: "warning",
    title: "Siting basis: Opportunity Zone only",
    text: "No PLP school within 5 miles in the tool's data. The standard letter's 5-mile sentence does not fit this site; draft it manually.",
  },
  none: {
    kind: "warning",
    title: "Not in a siting area",
    text: "The tool does not place this site in a School of Hope siting area. Confirm eligibility before drafting.",
  },
};

export function NoticeDialog({ facility, onClose }: { facility: NoticeFacility; onClose: () => void }) {
  const defaultProjected =
    facility.availableStations != null ? String(Math.max(0, Math.floor(facility.availableStations))) : "";

  // Build once from the source facts, seeding the human inputs with defaults.
  // district / basis / warnings depend only on the source, so they stay stable;
  // the field values become editable state the operator can adjust.
  const initial = useMemo(
    () => {
      const src: NoticeSourceInput = {
        name: facility.name,
        county: facility.county,
        address: facility.address,
        utilizationPct: facility.utilizationPct,
        availableStations: facility.availableStations,
        fishVintage: facility.fishVintage,
        anchors: facility.anchors,
        inOZ: facility.inOZ,
        date: today(),
        startYear: DEFAULT_START_YEAR,
        projectedEnrollment: defaultProjected,
      };
      return buildNotice(src);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facility],
  );

  const [fields, setFields] = useState<NoticeFields>(initial.fields);
  const [blankFill, setBlankFill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof NoticeFields, value: string) => setFields((f) => ({ ...f, [key]: value }));

  const toggleBlankFill = (checked: boolean) => {
    setBlankFill(checked);
    setFields((f) => {
      const next = { ...f };
      for (const k of FIGURE_KEYS) next[k] = checked ? BLANK : initial.fields[k];
      return next;
    });
  };

  const resetToData = () => {
    setFields(initial.fields);
    setBlankFill(false);
  };

  // Projected enrollment must not exceed capacity (Rule requirement). Only checked
  // when both are plain numbers (blank-fill or a manual "approx" phrase skips it).
  const capNum = Number(String(fields.capacity).replace(/[^0-9.]/g, ""));
  const projNum = Number(String(fields.projected_enrollment).replace(/[^0-9.]/g, ""));
  const projectedOverCapacity =
    !blankFill && Number.isFinite(capNum) && Number.isFinite(projNum) && projNum > capNum && capNum > 0;

  const requiredFilled = (Object.keys(fields) as Array<keyof NoticeFields>)
    .filter((k) => k !== "siting_basis")
    .every((k) => String(fields[k] ?? "").trim().length > 0);

  const canGenerate = Boolean(initial.district) && requiredFilled && !projectedOverCapacity && !busy;

  const generate = async () => {
    if (!initial.district) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await fillNotice(initial.district, fields);
      downloadBlob(blob, filename);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the notice.");
      setBusy(false);
    }
  };

  const basis = BASIS_COPY[initial.basis];

  const field = (key: keyof NoticeFields, label: string, opts: { disabled?: boolean } = {}) => (
    <TextInput
      id={`notice-${key}`}
      labelText={label}
      value={fields[key]}
      disabled={opts.disabled}
      onChange={(e) => set(key, e.target.value)}
    />
  );

  return createPortal(
    <Modal
      open
      modalHeading="Prepare building notice"
      modalLabel={`${facility.name} · ${initial.district ?? facility.county}`}
      primaryButtonText={busy ? "Generating..." : "Download .docx"}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!canGenerate}
      onRequestClose={onClose}
      onRequestSubmit={generate}
      size="md"
    >
      <div className="notice-dialog">
        <p className="notice-dialog__lede">
          This drafts a School of Hope Building Notice on KIPP letterhead. It is a legal filing:
          confirm every value below, then have counsel review before it is sent.
        </p>

        {!initial.district && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="No template"
            subtitle={`Only MDCPS and Broward are supported. ${facility.county} has no approved template.`}
          />
        )}

        {basis && (
          <InlineNotification kind={basis.kind} lowContrast hideCloseButton title={basis.title} subtitle={basis.text} />
        )}

        {initial.warnings.map((w, i) => (
          <InlineNotification key={i} kind="warning" lowContrast hideCloseButton title="Check" subtitle={w} />
        ))}

        <div className="notice-dialog__section">Your inputs</div>
        <Stack gap={4}>
          {field("date", "Notice date")}
          {field("start_year", "Target start school year")}
          {field("projected_enrollment", "Projected enrollment", { disabled: blankFill })}
          {projectedOverCapacity && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="Over capacity"
              subtitle={`Projected enrollment (${fields.projected_enrollment}) exceeds available capacity (${fields.capacity}). It must be at or below capacity.`}
            />
          )}
          <Checkbox
            id="notice-blankfill"
            labelText="Leave utilization, capacity, and projected enrollment blank (fill from the report by hand)"
            checked={blankFill}
            onChange={(_, { checked }) => toggleBlankFill(checked)}
          />
        </Stack>

        <div className="notice-dialog__section">
          From the tool <button type="button" className="notice-dialog__reset" onClick={resetToData}>Reset to data</button>
        </div>
        <Stack gap={4}>
          {field("facility_name_body", "Facility name (body)")}
          {field("facility_name_upper", "Facility name (RE line, uppercase)")}
          {field("facility_address", "Facility address")}
          {field("utilization", "Utilization", { disabled: blankFill })}
          {field("capacity", "Available capacity (student stations)", { disabled: blankFill })}
          {field("report_year", "FLDOE report year")}
          {field("plp_list_year", "PLP list year")}
          {field("plp_list", "PLP schools within 5 miles")}
        </Stack>

        {error && (
          <InlineNotification kind="error" lowContrast hideCloseButton title="Generation failed" subtitle={error} />
        )}

        <p className="notice-dialog__footnote">
          Recommended: counsel review (Woodring Law Firm, on the cc list) before sending. The tool prepares a draft
          only; it never sends.
        </p>
      </div>
    </Modal>,
    document.body,
  );
}
