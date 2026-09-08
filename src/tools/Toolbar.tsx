// Map tools: measure distance, radius-from-a-point, and draw-a-boundary. All are
// geodesically correct (WGS84 ellipsoidal distance; a true geodesic buffer ring).
//
// The tool BUTTONS live bottom-right with the other map controls. When a tool is
// active its control appears as a SLIM HORIZONTAL BAR pinned to the top-center
// edge of the map, NOT a card over the middle of the map: these tools require
// clicking points on the map, so the control must stay out of the click surface.
// The bar carries the mode label, a one-line instruction or the live readout, and
// the actions (undo / clear / done), so it is the only mode indicator needed.

import { useMemo } from "react";
import {
  Box, Paper, ToggleButton, ToggleButtonGroup, Typography, IconButton, Divider, Tooltip, Stack, Button, Chip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Ruler as StraightenIcon, CenterCircle as RadioButtonUncheckedIcon, Draw as GestureIcon, Undo as UndoIcon } from "@carbon/icons-react";
import { useStore, type ActiveTool } from "../store";
import { useData } from "../data/DataContext";
import { pathDistanceMiles, distanceMiles, milesToMeters, type LngLat } from "../geo/measure";
import { geodesicBufferMiles, areaSquareMiles } from "../geo/buffer";
import { apportionByArea } from "../geo/intersect";
import { ExportButton } from "./ExportButton";
import { TEAL, SHELL_DIM, SHELL_ON, SHELL_HAIRLINE } from "../muiTheme";
import type { SchoolFeature } from "../data/types";

const RADII = [1, 2, 3, 5, 10];

// Shared shell for an active-tool bar: a slim horizontal Paper. Left: icon +
// title + a compact detail line. Right: the actions. Wraps gracefully on narrow.
function ToolBar({ icon, title, detail, actions }: {
  icon: React.ReactNode; title: string; detail: React.ReactNode; actions: React.ReactNode;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        px: 1.5, py: 0.85, borderRadius: 2.5, bgcolor: "#FFFFFF",
        border: `1px solid ${alpha(TEAL, 0.45)}`, boxShadow: "var(--shadow-card)",
        display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap",
        maxWidth: "calc(100vw - 24px)", pointerEvents: "auto",
      }}
    >
      <Box sx={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 1.5, bgcolor: alpha(TEAL, 0.12), color: TEAL }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: SHELL_ON, lineHeight: 1.2 }}>{title}</Typography>
        <Box sx={{ mt: 0.1 }}>{detail}</Box>
      </Box>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.25, borderColor: SHELL_HAIRLINE }} />
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ flex: "none" }}>{actions}</Stack>
    </Paper>
  );
}

function Detail({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <Typography sx={{ fontSize: mono ? 13 : 11.5, fontWeight: mono ? 700 : 500, color: mono ? SHELL_ON : SHELL_DIM, lineHeight: 1.3, fontFamily: mono ? "var(--font-mono)" : "inherit", whiteSpace: "nowrap" }}>
      {children}
    </Typography>
  );
}

function DoneButton({ label = "Done" }: { label?: string }) {
  const setTool = useStore((s) => s.setTool);
  return (
    <Button size="small" variant="outlined" onClick={() => setTool("none")} sx={{ textTransform: "none", fontWeight: 600 }}>{label}</Button>
  );
}

function MeasureControls() {
  const measurePoints = useStore((s) => s.measurePoints);
  const clearMeasure = useStore((s) => s.clearMeasure);
  const undoMeasurePoint = useStore((s) => s.undoMeasurePoint);
  const pts: LngLat[] = measurePoints.map((p) => [p.lng, p.lat]);
  const miles = pathDistanceMiles(pts);
  const meters = milesToMeters(miles);

  return (
    <ToolBar
      icon={<StraightenIcon size={16} />}
      title="Measure distance"
      detail={measurePoints.length >= 2 ? (
        <Detail mono>{miles.toFixed(2)} mi <Box component="span" sx={{ color: SHELL_DIM, fontWeight: 500 }}>/ {(meters / 1000).toFixed(2)} km · geodesic</Box></Detail>
      ) : (
        <Detail>{measurePoints.length === 1 ? "Click another point to measure." : "Click points on the map to trace a path."}</Detail>
      )}
      actions={<>
        <Tooltip title="Undo last point"><span><IconButton size="small" onClick={undoMeasurePoint} disabled={measurePoints.length === 0} aria-label="Undo last point"><UndoIcon size={16} /></IconButton></span></Tooltip>
        <Button size="small" onClick={clearMeasure} disabled={measurePoints.length === 0} sx={{ textTransform: "none", color: SHELL_DIM, minWidth: 0 }}>Clear</Button>
        <DoneButton />
      </>}
    />
  );
}

function RadiusControls() {
  const radiusCenter = useStore((s) => s.radiusCenter);
  const radiusMiles = useStore((s) => s.radiusMiles);
  const setRadiusMiles = useStore((s) => s.setRadiusMiles);
  const setRadius = useStore((s) => s.setRadius);
  const { schools, income } = useData();

  const analysis = useMemo(() => {
    if (!radiusCenter) return null;
    const center: LngLat = [radiusCenter.lng, radiusCenter.lat];
    const ring = geodesicBufferMiles(center, radiusMiles);
    const areaMi2 = areaSquareMiles(ring);
    const inside: SchoolFeature[] = schools
      ? schools.features.filter((f) => distanceMiles(center, f.geometry.coordinates as LngLat) <= radiusMiles)
      : [];
    const reach = income ? apportionByArea(ring, income, "school_age_population", "geoid") : null;
    return { areaMi2, inside, reach };
  }, [radiusCenter, radiusMiles, schools, income]);

  return (
    <ToolBar
      icon={<RadioButtonUncheckedIcon size={16} />}
      title="Radius from a point"
      detail={
        <Stack direction="row" spacing={0.9} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 0.4 }}>
          <Stack direction="row" spacing={0.4} sx={{ flexWrap: "wrap", rowGap: 0.4 }}>
            {RADII.map((r) => (
              <Chip key={r} label={`${r} mi`} size="small"
                variant={radiusMiles === r ? "filled" : "outlined"}
                color={radiusMiles === r ? "primary" : "default"}
                onClick={() => setRadiusMiles(r)}
                sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />
            ))}
          </Stack>
          {radiusCenter && analysis ? (
            <Detail mono>
              {analysis.areaMi2.toFixed(1)} mi² · <Box component="span" sx={{ fontWeight: 700 }}>{analysis.inside.length.toLocaleString("en-US")}</Box> schools
              {analysis.reach ? <> · <Box component="span" sx={{ fontWeight: 700 }}>{Math.round(analysis.reach.total).toLocaleString("en-US")}</Box> <Box component="span" sx={{ color: SHELL_DIM, fontWeight: 500 }}>school-age pop</Box></> : null}
            </Detail>
          ) : (
            <Detail>Click the map to drop the center.</Detail>
          )}
        </Stack>
      }
      actions={<>
        {radiusCenter && analysis && (
          <ExportButton
            filenameBase="radius_selection"
            headers={["MSID", "Name", "County", "Current grade", "Distance from center (mi)"]}
            rows={analysis.inside.map((f) => [
              f.properties.msid, f.properties.name, f.properties.county, f.properties.current_grade,
              distanceMiles([radiusCenter.lng, radiusCenter.lat], f.geometry.coordinates as LngLat).toFixed(3),
            ])}
            label="Export"
          />
        )}
        {radiusCenter && <Button size="small" onClick={() => setRadius(null)} sx={{ textTransform: "none", color: SHELL_DIM, minWidth: 0 }}>Clear</Button>}
        <DoneButton />
      </>}
    />
  );
}

function DrawControls() {
  const drawPoints = useStore((s) => s.drawPoints);
  const undoDrawPoint = useStore((s) => s.undoDrawPoint);
  const finishDraw = useStore((s) => s.finishDraw);
  const clearDrawnBoundary = useStore((s) => s.clearDrawnBoundary);
  const setTool = useStore((s) => s.setTool);
  const n = drawPoints.length;

  return (
    <ToolBar
      icon={<GestureIcon size={16} />}
      title="Draw a boundary"
      detail={<Detail>{n === 0 ? "Click points on the map to outline an area." : `${n} point${n === 1 ? "" : "s"}${n < 3 ? " · need at least 3" : " · ready to finish"}`}</Detail>}
      actions={<>
        <Tooltip title="Undo last point"><span><IconButton size="small" onClick={undoDrawPoint} disabled={n === 0} aria-label="Undo last point"><UndoIcon size={16} /></IconButton></span></Tooltip>
        <Button size="small" onClick={clearDrawnBoundary} sx={{ textTransform: "none", color: SHELL_DIM, minWidth: 0 }}>Clear</Button>
        <Button size="small" onClick={() => setTool("none")} sx={{ textTransform: "none", color: SHELL_DIM, minWidth: 0 }}>Cancel</Button>
        <Button size="small" variant="contained" disableElevation onClick={finishDraw} disabled={n < 3} sx={{ textTransform: "none", fontWeight: 600 }}>Finish</Button>
      </>}
    />
  );
}

export function Toolbar() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);

  return (
    <>
      {/* Active-tool control: a slim bar at the top-center EDGE, so it never sits
          over the map surface the tool needs you to click. */}
      {activeTool !== "none" && (
        <Box sx={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 9, display: "flex", justifyContent: "center", maxWidth: "calc(100vw - 24px)", pointerEvents: "none" }}>
          {activeTool === "measure" && <MeasureControls />}
          {activeTool === "radius" && <RadiusControls />}
          {activeTool === "draw" && <DrawControls />}
        </Box>
      )}

      {/* Tool buttons: vertical white rounded-square stack, bottom-right, matching
          the zoom / full-screen / compass controls below it. */}
      <Box sx={{ position: "absolute", right: 16, bottom: 200, zIndex: 8, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <Paper elevation={0} sx={{ borderRadius: "0", overflow: "hidden", border: `1px solid ${SHELL_HAIRLINE}`, boxShadow: "var(--shadow-card)" }}>
          <ToggleButtonGroup
            orientation="vertical"
            value={activeTool === "none" ? null : activeTool}
            exclusive
            onChange={(_, v: ActiveTool | null) => setTool(v ?? "none")}
            size="small"
            sx={{
              "& .MuiToggleButton-root": {
                width: 40, height: 40, borderRadius: 0, border: "none", color: SHELL_DIM,
                "&:not(:last-of-type)": { borderBottom: `1px solid ${SHELL_HAIRLINE}` },
                "&:hover": { bgcolor: "#f4f5f7", color: SHELL_ON },
                "&.Mui-selected": { bgcolor: alpha(TEAL, 0.16), color: TEAL, "&:hover": { bgcolor: alpha(TEAL, 0.24) } },
              },
            }}
          >
            <Tooltip title="Measure distance (geodesic)" placement="left">
              <ToggleButton value="measure" aria-label="Measure distance"><StraightenIcon size={18} /></ToggleButton>
            </Tooltip>
            <Tooltip title="Radius from a point (geodesic buffer)" placement="left">
              <ToggleButton value="radius" aria-label="Radius from a point"><RadioButtonUncheckedIcon size={18} /></ToggleButton>
            </Tooltip>
            <Tooltip title="Draw a boundary (filter to the area)" placement="left">
              <ToggleButton value="draw" aria-label="Draw a boundary"><GestureIcon size={18} /></ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Paper>
      </Box>
    </>
  );
}
