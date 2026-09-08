// Builds public/data/schools_of_hope.json from the Schools of Hope Revolving
// Loan Fund payment ledger (F.S. 1001.292; FL DOE loan-fund page, reproduced in
// "Copy of Schools of Hope Resources.pdf"). These are the real Schools of Hope
// sites that have drawn revolving-loan capital. Addresses are geocoded with the
// free U.S. Census geocoder (no key) so the points are rooftop-accurate, matching
// the accuracy standard used for the school layer.
//
// Run: node scripts/build-schools-of-hope.mjs

import { writeFileSync } from "node:fs";

// The ledger, verbatim from the source. amount in USD; date as reported.
const LEDGER = [
  { operator: "IDEA Public Schools", address: "5050 10th Avenue, Tampa, FL", amount: 7969479, date: "2020-09", note: "" },
  { operator: "IDEA Public Schools", address: "11612 N. Nebraska Avenue, Tampa, FL", amount: 8152777, date: "2021-03", note: "" },
  { operator: "IDEA Public Schools", address: "1845 Bassett Road, Jacksonville, FL", amount: 8155501, date: "2021-03", note: "" },
  { operator: "IDEA Public Schools", address: "2354 University Boulevard, Jacksonville, FL", amount: 8155501, date: "2021-05", note: "" },
  { operator: "IDEA Public Schools", address: "Lenox Avenue and Lane Avenue, Jacksonville, FL", amount: 8155501, date: "2022-02", note: "Reported as 'Lenox and Lane avenues'." },
  { operator: "KIPP Miami", address: "11380 NW 27th Avenue, Miami, FL", amount: 9835470, date: "2022-03", note: "Miami-Dade College, North Campus." },
  { operator: "IDEA Public Schools", address: "10414 Hart Pond Road, Thonotosassa, FL", amount: 7715788, date: "2022-04", note: "Future location as reported." },
  { operator: "IDEA Public Schools", address: "625 Reynolds Road, Lakeland, FL", amount: 9280594, date: "2022-06", note: "Future location as reported." },
  { operator: "IDEA Public Schools", address: "4949 Blanding Boulevard, Jacksonville, FL", amount: 9280594, date: "2022-07", note: "Future location as reported." },
  { operator: "Mater Academy", address: "230 SW 7th Road, Miami, FL", amount: 9418258, date: "2022-12", note: "Reported as 230-260 SW 7th Road." },
  { operator: "KIPP Miami", address: "1080 NW 79th Street, Miami, FL", amount: 10460997, date: "2024-01", note: "" },
  { operator: "RCMA", address: "4440 Academy Drive, Mulberry, FL", amount: 2349548, date: "2024-07", note: "" },
];

// Manual fallbacks for addresses the one-line geocoder can miss (intersections
// or streets absent from the Census address range files). Flagged approximate.
const FALLBACK = {
  "Lenox Avenue and Lane Avenue, Jacksonville, FL": { lat: 30.3226, lng: -81.7492 },
  // RCMA Mulberry (Polk County): "4440 Academy Drive" is not in the Census
  // range files; placed at the Mulberry, FL area. Outside the three pilot
  // counties, so it does not affect the in-scope view.
  "4440 Academy Drive, Mulberry, FL": { lat: 27.8964, lng: -81.9731 },
};

async function geocode(address) {
  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=" +
    encodeURIComponent(address) +
    "&benchmark=Public_AR_Current&format=json";
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    const d = await r.json();
    const m = d.result?.addressMatches?.[0];
    if (m) return { lat: m.coordinates.y, lng: m.coordinates.x, matched: m.matchedAddress, source: "census" };
  } catch {
    /* fall through */
  } finally {
    clearTimeout(t);
  }
  if (FALLBACK[address]) return { ...FALLBACK[address], matched: address + " (approx.)", source: "manual" };
  return null;
}

function county(lat, lng) {
  // Rough attribution to the three pilot counties (loose bboxes from
  // src/geo/countyBounds.ts); otherwise null (out of pilot scope).
  if (lng >= -80.9 && lng <= -80.1 && lat >= 25.1 && lat <= 26.0) return "Miami-Dade";
  if (lng >= -80.9 && lng <= -80.05 && lat >= 25.95 && lat <= 26.4) return "Broward";
  if (lng >= -81.7 && lng <= -80.85 && lat >= 28.3 && lat <= 28.85) return "Orange";
  return null;
}

const features = [];
let total = 0;
for (const e of LEDGER) {
  const g = await geocode(e.address);
  if (!g) {
    console.error("NO GEOCODE:", e.address);
    continue;
  }
  total += e.amount;
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [g.lng, g.lat] },
    properties: {
      operator: e.operator,
      address: g.matched,
      reported_address: e.address,
      amount: e.amount,
      date: e.date,
      note: e.note,
      county: county(g.lat, g.lng),
      geocode_source: g.source,
    },
  });
  console.error(`OK  ${e.operator.padEnd(22)} ${g.lat.toFixed(5)},${g.lng.toFixed(5)}  ${g.matched}`);
}

const out = {
  type: "FeatureCollection",
  vintage: "FL DOE Schools of Hope Revolving Loan Fund ledger (as reproduced in project resources PDF)",
  source: "F.S. 1001.292; https://www.fldoe.org/schools/school-choice/other-school-choice-options/schools-of-hope/loan-fund.stml",
  total_disbursed: total,
  features,
};

writeFileSync("public/data/schools_of_hope.json", JSON.stringify(out, null, 2));
console.error(`\nWrote ${features.length} sites, $${total.toLocaleString("en-US")} total.`);
