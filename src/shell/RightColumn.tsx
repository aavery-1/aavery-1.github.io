// The right column is reserved for detail: it appears only when a school is
// selected. When nothing is selected, the map gets the full width. The
// aggregate status the old panel showed (counts, grade mix, utilization mix)
// now lives in a slim strip along the bottom of the map, where it costs
// almost no pixels and never competes with the map itself.

import { useStore } from "../store";
import { SchoolInspector } from "../inspector/SchoolInspector";

// `compact` renders the inspector as a lighter, narrower floating card (used on
// the map, where it should sit as a companion and not claim a full-height slab).
export function RightColumn({ compact = false }: { compact?: boolean } = {}) {
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  if (!selectedSchoolMsid) return null;
  return <SchoolInspector compact={compact} />;
}
