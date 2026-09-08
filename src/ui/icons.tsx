// The one icon set: Material Symbols (MD3's icon family), via @mui/icons-material
// Rounded variants to match MD3's rounded shape language. Re-exported from a
// single place so every surface uses one iconography at a uniform size.
//
// The call sites use the Carbon-era `size` prop (px). The `make` wrapper adapts
// that to MUI's font-size sizing, so `<Icon.X size={16} />` and the named
// exports below keep the exact same API. Icons inherit currentColor. No em
// dashes in this file (prose style rule).

import type { ComponentType } from "react";
import type { SvgIconProps } from "@mui/material/SvgIcon";

import CloseRounded from "@mui/icons-material/CloseRounded";
import CompareArrowsRounded from "@mui/icons-material/CompareArrowsRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import RemoveRounded from "@mui/icons-material/RemoveRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import StraightenRounded from "@mui/icons-material/StraightenRounded";
import RadioButtonUncheckedRounded from "@mui/icons-material/RadioButtonUncheckedRounded";
import GestureRounded from "@mui/icons-material/GestureRounded";
import UndoRounded from "@mui/icons-material/UndoRounded";
import LocationOnRounded from "@mui/icons-material/LocationOnRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CancelRounded from "@mui/icons-material/CancelRounded";
import FilterAltRounded from "@mui/icons-material/FilterAltRounded";
import SchoolRounded from "@mui/icons-material/SchoolRounded";
import MapRounded from "@mui/icons-material/MapRounded";
import FormatListBulletedRounded from "@mui/icons-material/FormatListBulletedRounded";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import KeyboardRounded from "@mui/icons-material/KeyboardRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import SatelliteAltRounded from "@mui/icons-material/SatelliteAltRounded";
import TerrainRounded from "@mui/icons-material/TerrainRounded";
import BarChartRounded from "@mui/icons-material/BarChartRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import LayersRounded from "@mui/icons-material/LayersRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import FirstPageRounded from "@mui/icons-material/FirstPageRounded";
import LastPageRounded from "@mui/icons-material/LastPageRounded";
import FullscreenRounded from "@mui/icons-material/FullscreenRounded";
import FullscreenExitRounded from "@mui/icons-material/FullscreenExitRounded";
import ExploreRounded from "@mui/icons-material/ExploreRounded";

// Carbon-compatible icon props: a `size` in px, plus the usual SvgIcon props.
export type IconProps = { size?: number } & Omit<SvgIconProps, "fontSize">;
export type AppIcon = ComponentType<IconProps>;

// Adapt an MUI icon to the `size` (px) API the call sites use.
function make(C: ComponentType<SvgIconProps>): AppIcon {
  return function M3Icon({ size = 20, sx, ...rest }: IconProps) {
    return <C {...rest} sx={{ fontSize: size, ...sx }} />;
  };
}

// Named exports, keyed by the Carbon names the direct imports used, so those
// imports repoint here with no call-site change.
export const Close = make(CloseRounded);
export const Compare = make(CompareArrowsRounded);
export const Search = make(SearchRounded);
export const Add = make(AddRounded);
export const Subtract = make(RemoveRounded);
export const Download = make(DownloadRounded);
export const Ruler = make(StraightenRounded);
export const CenterCircle = make(RadioButtonUncheckedRounded);
export const Draw = make(GestureRounded);
export const Undo = make(UndoRounded);
export const Location = make(LocationOnRounded);
export const CheckmarkFilled = make(CheckCircleRounded);
export const Misuse = make(CancelRounded);
export const Filter = make(FilterAltRounded);
export const Education = make(SchoolRounded);
export const Map = make(MapRounded);
export const List = make(FormatListBulletedRounded);
export const Information = make(InfoOutlined);
export const Help = make(HelpOutlineRounded);
export const Keyboard = make(KeyboardRounded);
export const Menu = make(MenuRounded);
export const ChevronDown = make(ExpandMoreRounded);
export const ChevronUp = make(ExpandLessRounded);
export const ChevronRight = make(ChevronRightRounded);
export const ArrowRight = make(ArrowForwardRounded);
export const Satellite = make(SatelliteAltRounded);
export const Mountain = make(TerrainRounded);

// Semantic namespace used across the app.
export const Icon = {
  Schools: Education,
  Demand: make(BarChartRounded),
  Risk: make(WarningAmberRounded),
  Boundaries: make(MapRounded),
  Context: make(LayersRounded),
  Measure: Ruler,
  Radius: CenterCircle,
  Copy: make(ContentCopyRounded),
  Export: Download,
  Settings: make(SettingsRounded),
  Help,
  Close,
  Search,
  Pin: Location,
  Info: Information,
  Retry: make(RefreshRounded),
  ChevronDown,
  ChevronRight,
  Compare,
  Eye: make(VisibilityRounded),
  EyeOff: make(VisibilityOffRounded),
  CollapsePanel: make(FirstPageRounded),
  ExpandPanel: make(LastPageRounded),
  Layers: make(LayersRounded),
  ZoomIn: Add,
  ZoomOut: Subtract,
  Fullscreen: make(FullscreenRounded),
  ExitFullscreen: make(FullscreenExitRounded),
  Compass: make(ExploreRounded),
} as const;
