// Base map: the base imagery picker (Default / Satellite / Terrain) and the
// Google overlay toggles (traffic, transit, bicycling), in one flyout panel off a
// top-right icon button. The base imagery is a single choice, shown as labeled
// preview cards; the overlays are independent switches. The button is bare (no
// card of its own) so it can sit inside the shared top-right control group next
// to the legend, matching the bottom-right zoom cluster.

import { useState } from "react";
import { Box, IconButton, Popover, FormControlLabel, Switch, Typography, Divider, Tooltip } from "@mui/material";
import { Map as MapIcon, Satellite as SatelliteAltIcon, Mountain as TerrainIcon } from "@carbon/icons-react";
import { useStore, type BaseMapType, type MapOverlays } from "../store";
import { ACCENT, SHELL_ON, SHELL_DIM, SHELL_HAIRLINE } from "../muiTheme";

const OVERLAYS: Array<{ key: keyof MapOverlays; label: string }> = [
  { key: "traffic", label: "Traffic" },
  { key: "transit", label: "Transit" },
  { key: "bicycling", label: "Bicycling" },
];

const VIEWS: Array<{ value: BaseMapType; label: string; icon: typeof MapIcon; bg: string; fg: string }> = [
  { value: "roadmap", label: "Default", icon: MapIcon, bg: "linear-gradient(135deg,#EAF1E6 0%,#DCE7F5 100%)", fg: "#5B7C8A" },
  { value: "satellite", label: "Satellite", icon: SatelliteAltIcon, bg: "linear-gradient(135deg,#3B4A3A 0%,#5C6B58 100%)", fg: "#E8EFE4" },
  { value: "terrain", label: "Terrain", icon: TerrainIcon, bg: "linear-gradient(135deg,#EDE6D8 0%,#D8E0CE 100%)", fg: "#7A6E52" },
];

export function MapLayersControl() {
  const baseMapType = useStore((s) => s.baseMapType);
  const setBaseMapType = useStore((s) => s.setBaseMapType);
  const overlays = useStore((s) => s.overlays);
  const toggleOverlay = useStore((s) => s.toggleOverlay);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title="Base map & view" placement="left">
        <IconButton
          aria-label="Base map and view"
          onClick={(e) => setAnchor(e.currentTarget)}
          size="small"
          sx={{ width: 40, height: 40, borderRadius: 0, color: anchor ? ACCENT : SHELL_DIM, "&:hover": { bgcolor: "#f4f5f7", color: SHELL_ON } }}
        >
          <MapIcon size={18} />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 1, borderRadius: 0, border: `1px solid ${SHELL_HAIRLINE}`, boxShadow: "var(--shadow-card)", overflow: "hidden" } } }}
      >
        <Box sx={{ p: 2, width: 268 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: SHELL_ON, mb: 1.5 }}>Base map</Typography>

          <SectionLabel>Map view</SectionLabel>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, mt: 0.75, mb: 2 }}>
            {VIEWS.map((v) => {
              const selected = baseMapType === v.value;
              const Ico = v.icon;
              return (
                <Box
                  key={v.value}
                  role="button"
                  tabIndex={0}
                  onClick={() => setBaseMapType(v.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBaseMapType(v.value); } }}
                  sx={{ cursor: "pointer", textAlign: "center" }}
                >
                  <Box
                    sx={{
                      height: 52, borderRadius: 2, background: v.bg,
                      border: `2px solid ${selected ? ACCENT : "transparent"}`,
                      outline: selected ? "none" : `1px solid ${SHELL_HAIRLINE}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "border-color 120ms ease",
                    }}
                  >
                    <Ico size={20} style={{ color: v.fg }} />
                  </Box>
                  <Typography sx={{ fontSize: 12, fontWeight: selected ? 700 : 500, color: selected ? SHELL_ON : SHELL_DIM, mt: 0.5 }}>
                    {v.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          <Divider sx={{ borderColor: SHELL_HAIRLINE }} />

          <SectionLabel sx={{ mt: 1.5 }}>Overlays</SectionLabel>
          <Box sx={{ display: "flex", flexDirection: "column", mt: 0.25 }}>
            {OVERLAYS.map((o) => (
              <FormControlLabel
                key={o.key}
                control={<Switch size="small" checked={overlays[o.key]} onChange={() => toggleOverlay(o.key)} />}
                label={o.label}
                sx={{ mx: 0, justifyContent: "space-between", ml: 0, ".MuiFormControlLabel-label": { fontSize: 13, color: SHELL_ON } }}
                labelPlacement="start"
              />
            ))}
          </Box>
        </Box>
      </Popover>
    </>
  );
}

function SectionLabel({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 700, color: SHELL_DIM, textTransform: "none", letterSpacing: 0.16, ...sx }}>
      {children}
    </Typography>
  );
}
