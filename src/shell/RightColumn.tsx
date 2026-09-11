// The right column is reserved for detail: it appears only when a school is
// selected. When nothing is selected, the map gets the full width. The
// aggregate status the old panel showed (counts, grade mix, utilization mix)
// now lives in a slim strip along the bottom of the map, where it costs
// almost no pixels and never competes with the map itself.

import { useStore } from "../store";
import { SchoolInspector } from "../inspector/SchoolInspector";

// `compact` renders the inspector as a lighter, narrower floating card (used on
// the map, where it should sit as a companion and not claim a full-height slab).
// `overrideMsid` keeps the panel rendering a school after it has been deselected,
// so the caller can play a slide-away close animation before unmounting.
export function RightColumn({ compact = false, overrideMsid }: { compact?: boolean; overrideMsid?: string } = {}) {
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  const msid = overrideMsid ?? selectedSchoolMsid;
  if (!msid) return null;
  return <SchoolInspector compact={compact} overrideMsid={msid} />;
}
