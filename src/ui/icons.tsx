// The one icon set: IBM Carbon icons (@carbon/icons-react), re-exported from a
// single place so every surface uses Carbon iconography at a uniform size.
// Carbon icons take a `size` prop and inherit `currentColor`, so the call sites
// (which pass size / color like the previous set) do not change.

import {
  Education,
  ChartBar,
  WarningAlt,
  MapBoundary,
  Layers,
  Ruler,
  CenterCircle,
  Copy,
  Download,
  Settings,
  Help,
  Close,
  Search,
  Location,
  Information,
  Renew,
  ChevronDown,
  ChevronRight,
  Compare,
  View,
  ViewOff,
  SidePanelClose,
  SidePanelOpen,
  Add,
  Subtract,
  Maximize,
  Minimize,
  Compass,
  type CarbonIconType,
} from "@carbon/icons-react";

export type { CarbonIconType };
// Back-compat alias for the previous type name.
export type LucideIcon = CarbonIconType;

export const Icon = {
  Schools: Education,
  Demand: ChartBar,
  Risk: WarningAlt,
  Boundaries: MapBoundary,
  Context: Layers,
  Measure: Ruler,
  Radius: CenterCircle,
  Copy,
  Export: Download,
  Settings,
  Help,
  Close,
  Search,
  Pin: Location,
  Info: Information,
  Retry: Renew,
  ChevronDown,
  ChevronRight,
  Compare,
  Eye: View,
  EyeOff: ViewOff,
  CollapsePanel: SidePanelClose,
  ExpandPanel: SidePanelOpen,
  Layers,
  ZoomIn: Add,
  ZoomOut: Subtract,
  Fullscreen: Maximize,
  ExitFullscreen: Minimize,
  Compass,
} as const;

export const GROUP_ICON: Record<string, CarbonIconType> = {
  Schools: Education,
  Demand: ChartBar,
  Risk: WarningAlt,
  Boundaries: MapBoundary,
  Context: Layers,
};
