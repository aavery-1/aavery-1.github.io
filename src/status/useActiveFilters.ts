// Single source for "which filters are currently active", as a flat list of
// removable chips. Both the map's active-filter breadcrumb (ActiveFilterChips)
// and the filter panel's applied-filters summary read this, so the two can never
// disagree about what is on or how to clear it.

import { useStore, ALL_COUNTIES, FACILITY_USE_TIERS, type DistrictFilter } from "../store";
import { DISTRICT_KINDS, boardLabelFromKey } from "../data/derive/districts";
import { titleILabel, schoolTypeLabel } from "../data/types";

export interface ActiveFilter {
  key: string;
  section: "Geography" | "Schools";
  label: string;
  onClear: () => void;
}

function districtFilterLabel(f: DistrictFilter): string {
  if (f.kind === "board") return boardLabelFromKey(f.value);
  const kind = DISTRICT_KINDS.find((k) => k.kind === f.kind);
  return `${kind?.label ?? f.kind} District ${f.value}`;
}

export function useActiveFilters(): ActiveFilter[] {
  const s = useStore();
  const filters: ActiveFilter[] = [];

  if (s.countySelection.size !== ALL_COUNTIES.length) {
    const label = s.countySelection.size === 0 ? "No counties" : [...s.countySelection].join(", ");
    filters.push({ key: "county", section: "Geography", label, onClear: () => s.setCounties(ALL_COUNTIES) });
  }
  if (s.districtFilter) filters.push({ key: "district", section: "Geography", label: districtFilterLabel(s.districtFilter), onClear: () => s.setDistrictFilter(null) });
  if (s.drawnBoundary && s.drawnBoundary.length >= 3) filters.push({ key: "boundary", section: "Geography", label: "Drawn area", onClear: () => s.clearDrawnBoundary() });

  if (s.plpOnly) filters.push({ key: "plp", section: "Schools", label: "Persistently low-performing", onClear: () => s.setPlpOnly(false) });
  if (s.coLocationOnly) filters.push({ key: "coloc", section: "Schools", label: "Co-location candidate", onClear: () => s.setCoLocationOnly(false) });
  if (s.gradeSelection.size > 0) filters.push({ key: "grade", section: "Schools", label: `Grade ${[...s.gradeSelection].join(", ")}`, onClear: s.clearGrades });
  if (s.levelSelection.size > 0) filters.push({ key: "level", section: "Schools", label: [...s.levelSelection].join(", "), onClear: s.clearLevels });
  if (s.typeSelection.size > 0) filters.push({ key: "type", section: "Schools", label: [...s.typeSelection].map(schoolTypeLabel).join(", "), onClear: s.clearTypes });
  for (const tier of FACILITY_USE_TIERS) {
    if (s.facilityUseSelection.has(tier.key)) {
      filters.push({ key: `fu-${tier.key}`, section: "Schools", label: `Facility use: ${tier.label}`, onClear: () => s.toggleFacilityUse(tier.key) });
    }
  }
  if (s.titleISelection.size > 0) filters.push({ key: "titlei", section: "Schools", label: `Title I: ${[...s.titleISelection].map(titleILabel).join(", ")}`, onClear: s.clearTitleI });

  return filters;
}
