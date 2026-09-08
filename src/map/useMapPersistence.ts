// URL hash persistence. Every meaningful view is shareable via link. On mount we
// hydrate the store from the hash; on any relevant change we write the hash back
// with replaceState so we do not spam browser history. This is the substitute
// for saved views in the one-shot (see 06_ARCHITECTURE.md).

import { useEffect, useRef } from "react";
import { useStore, ALL_COUNTIES, type AppState, type FacilityUseKey, type LatLng } from "../store";
import type { CountyName, SchoolLevel, SchoolType } from "../data/types";
import type { Grade } from "../map/gradeEncoding";

function encode(s: AppState): string {
  const params = new URLSearchParams();
  if (s.activeLayerIds.size) params.set("layers", [...s.activeLayerIds].join(","));
  if (s.countySelection.size !== ALL_COUNTIES.length) params.set("co", [...s.countySelection].join(","));
  if (s.gradeSelection.size) params.set("grades", [...s.gradeSelection].join(","));
  if (s.levelSelection.size) params.set("levels", [...s.levelSelection].join(","));
  if (s.typeSelection.size) params.set("types", [...s.typeSelection].join(","));
  if (s.plpOnly) params.set("plp", "1");
  if (s.coLocationOnly) params.set("coloc", "1");
  if (s.facilityUseSelection.size) params.set("fu", [...s.facilityUseSelection].join(","));
  if (s.selectedSchoolMsid) params.set("sel", s.selectedSchoolMsid);
  if (s.comparePinnedMsids.length) params.set("cmp", s.comparePinnedMsids.join(","));
  if (s.activeTool !== "none") params.set("tool", s.activeTool);
  if (s.radiusCenter) params.set("r", `${s.radiusCenter.lat.toFixed(5)},${s.radiusCenter.lng.toFixed(5)},${s.radiusMiles}`);
  params.set("c", `${s.mapCenter.lat.toFixed(5)},${s.mapCenter.lng.toFixed(5)}`);
  params.set("z", String(s.mapZoom));
  return params.toString();
}

function parseLatLng(v: string | null): LatLng | null {
  if (!v) return null;
  const [lat, lng] = v.split(",").map(Number);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function readHash(): Partial<AppState> {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return {};
  const p = new URLSearchParams(raw);
  const out: Partial<AppState> = {};
  const layers = p.get("layers");
  if (layers) out.activeLayerIds = new Set(layers.split(",").filter(Boolean));
  const co = p.get("co");
  if (co != null) out.countySelection = new Set(co.split(",").filter(Boolean) as CountyName[]);
  const grades = p.get("grades");
  if (grades) out.gradeSelection = new Set(grades.split(",").filter(Boolean) as Grade[]);
  const levels = p.get("levels");
  if (levels) out.levelSelection = new Set(levels.split(",").filter(Boolean) as SchoolLevel[]);
  const types = p.get("types");
  if (types) out.typeSelection = new Set(types.split(",").filter(Boolean) as SchoolType[]);
  if (p.get("plp") === "1") out.plpOnly = true;
  if (p.get("coloc") === "1") out.coLocationOnly = true;
  const fu = p.get("fu");
  if (fu) {
    const valid = new Set(["under", "inuse", "full"]);
    out.facilityUseSelection = new Set(fu.split(",").filter((k) => valid.has(k)) as FacilityUseKey[]);
  }
  const sel = p.get("sel");
  if (sel) out.selectedSchoolMsid = sel;
  const cmp = p.get("cmp");
  if (cmp) out.comparePinnedMsids = cmp.split(",").filter(Boolean).slice(0, 4);
  const tool = p.get("tool");
  if (tool === "measure" || tool === "radius") out.activeTool = tool;
  const center = parseLatLng(p.get("c"));
  if (center) out.mapCenter = center;
  const z = Number(p.get("z"));
  if (Number.isFinite(z) && z > 0) out.mapZoom = z;
  const r = p.get("r");
  if (r) {
    const [lat, lng, miles] = r.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      out.radiusCenter = { lat, lng };
      if (Number.isFinite(miles)) out.radiusMiles = miles;
    }
  }
  return out;
}

export function useMapPersistence() {
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const fromHash = readHash();
    if (Object.keys(fromHash).length) useStore.getState().hydrate(fromHash);
  }, []);

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (!hydrated.current) return;
      const next = encode(state);
      const current = window.location.hash.replace(/^#/, "");
      if (next !== current) {
        window.history.replaceState(null, "", `#${next}`);
      }
    });
    return unsub;
  }, []);
}
