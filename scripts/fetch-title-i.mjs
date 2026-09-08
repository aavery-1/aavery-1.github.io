// Populate Title I eligibility per school from the NCES Common Core of Data (CCD)
// directory, via the Urban Institute Education Data API. Title I eligibility is a
// statutory requirement for a School of Hope (F.S. 1002.333), so the tool needs a
// real value, not the all-false placeholder it shipped with.
//
// Run:  node scripts/fetch-title-i.mjs      (from the project root)
//       npm run data:titlei
//
// SOURCE: educationdata.urban.org CCD directory. The CCD field `seasch` is the
// Florida state school id, identical to the tool's MSID, so the join is direct.
// The most recent CCD year with Title I populated is 2021-2022; 2022 reports the
// field as null for every Florida school, so 2021 is used.
//
// TRI-STATE: title_i is "yes" (title_i_eligible = 1), "no" (= 0), or "unknown"
// (null / no CCD match). Missing data stays "unknown" - never silently "no".
//
// OUTPUT: public/data/schools.sample.geojson (title_i + title_i_schoolwide patched)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCHOOLS = resolve(ROOT, "public/data/schools.sample.geojson");
const YEAR = 2021;
// A browser User-Agent: the API sits behind Cloudflare, which blocks the default
// Node fetch agent.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};

async function fetchDirectory() {
  const byMsid = new Map();
  let url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/${YEAR}/?fips=12&limit=2000`;
  while (url) {
    const j = JSON.parse(await (await fetch(url, { headers: HEADERS })).text());
    for (const r of j.results || []) {
      if (!r.seasch) continue;
      let title_i = "unknown";
      if (r.title_i_eligible === 1) title_i = "yes";
      else if (r.title_i_eligible === 0) title_i = "no";
      byMsid.set(String(r.seasch), { title_i, schoolwide: r.title_i_schoolwide === 1 });
    }
    url = j.next || null;
  }
  return byMsid;
}

async function main() {
  const ti = await fetchDirectory();
  const geo = JSON.parse(readFileSync(SCHOOLS, "utf8"));
  const counts = { yes: 0, no: 0, unknown: 0 };
  let matched = 0;
  for (const f of geo.features) {
    const p = f.properties;
    const rec = ti.get(p.msid);
    if (rec) {
      matched++;
      p.title_i = rec.title_i;
      p.title_i_schoolwide = rec.title_i === "yes" ? rec.schoolwide : false;
    } else {
      p.title_i = "unknown";
      p.title_i_schoolwide = false;
    }
    // Keep the legacy boolean consistent (true only when definitively eligible).
    p.title_i_eligible = p.title_i === "yes";
    counts[p.title_i]++;
  }
  writeFileSync(SCHOOLS, JSON.stringify(geo));
  console.log(`CCD ${YEAR} Title I records: ${ti.size}`);
  console.log(`Schools matched: ${matched} / ${geo.features.length}`);
  console.log(`title_i -> yes ${counts.yes}, no ${counts.no}, unknown ${counts.unknown}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
