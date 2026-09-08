// Map legend. Explains every encoding currently drawn on the map: grade
// color+letter, school-type shape, the co-location dot, the School of Hope star,
// the PLP eligibility area, and any active overlay (income / growth ramps,
// opportunity zones, flood zones, boundary lines). Sections appear only when
// their layer is active, so the legend always matches what is on screen.
//
// Compact by design: swatch + label rows only, with the longer explanations moved
// to hover tooltips (and the school inspector) so the card stays small on the map.

import { useState } from "react";
import { Box, Typography, Tooltip, IconButton, Popover } from "@mui/material";
import { List as ListIcon } from "@carbon/icons-react";
import { useStore } from "../store";
import { layerById } from "../config/layers";
import { GRADE_STYLES, rgbaToCss, GRADE_DOMAIN } from "./gradeEncoding";
import { SHAPE_LEGEND, shapeSvgElement, type MarkerShape } from "./markerShapes";
import { ACCENT, SHELL_ON, SHELL_DIM, SHELL_HAIRLINE } from "../muiTheme";

const SLATE = "#334155";
const CO_LOC_TEAL = "#0D9488"; // matches the teal co-location dot on the map

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}
function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;
}

// One grade swatch: a CIRCLE with the letter inside, matching how the map draws
// school markers (color + letter).
function GradeDot({ grade }: { grade: keyof typeof GRADE_STYLES }) {
  const s = GRADE_STYLES[grade];
  return (
    <Box
      sx={{
        width: 16, height: 16, borderRadius: "50%", flex: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: s.letter.length > 1 ? 6.5 : 9, fontWeight: 800, lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        bgcolor: rgbaToCss(s.fill), color: rgbaToCss(s.letterColor),
        border: `1.5px ${s.dashed ? "dashed" : "solid"} ${rgbaToCss(s.stroke)}`,
        boxShadow: "0 1px 2px rgba(15,23,42,0.14)",
      }}
      aria-label={s.description}
      title={s.description}
    >
      {s.letter}
    </Box>
  );
}

// A neutral shape swatch matching the map's school-type markers.
function ShapeSwatch({ shape }: { shape: MarkerShape }) {
  return (
    <Box component="span" sx={{ width: 14, height: 14, flex: "none", display: "inline-flex" }}>
      <svg viewBox="0 0 100 100" width="14" height="14" aria-hidden>
        <g fill="#E2E8F0" stroke={SLATE} strokeWidth={9} strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: shapeSvgElement(shape) }} />
      </svg>
    </Box>
  );
}

// A section: a tight uppercase micro-label in a fixed left column, with its
// swatches to the RIGHT on the same line (not stacked above), so the legend stays
// short. The label carries an optional hover tooltip with the longer explanation.
function Section({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  const label = (
    <Typography
      sx={{ fontSize: 10, fontWeight: 700, color: SHELL_DIM, textTransform: "none", letterSpacing: "0.01em", lineHeight: 1.35, cursor: info ? "help" : "default" }}
    >
      {title}
    </Typography>
  );
  return (
    <Box sx={{ display: "flex", gap: 1, mb: 0.65, alignItems: "flex-start" }}>
      <Box sx={{ width: 40, flex: "none", pt: 0.3 }}>
        {info ? <Tooltip title={info} placement="left" arrow enterTouchDelay={0}>{label}</Tooltip> : label}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

function Row({ swatch, label, info }: { swatch: React.ReactNode; label: string; info?: string }) {
  const body = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.9, mb: 0.4, cursor: info ? "help" : "default" }}>
      <Box sx={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 16 }}>{swatch}</Box>
      <Typography sx={{ fontSize: 12, color: SHELL_ON, lineHeight: 1.25, fontWeight: 500 }}>{label}</Typography>
    </Box>
  );
  return info ? <Tooltip title={info} placement="left" arrow enterTouchDelay={0}>{body}</Tooltip> : body;
}

function LineSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return <Box component="span" sx={{ width: 16, height: 0, borderTop: `2.5px ${dashed ? "dashed" : "solid"} ${color}`, flex: "none" }} />;
}

function AreaSwatch({ color, border }: { color: string; border: string }) {
  return <Box component="span" sx={{ width: 14, height: 11, borderRadius: 0.75, bgcolor: color, border: `1.5px solid ${border}`, flex: "none" }} />;
}

function Ramp({ stops, min, mid, max }: { stops: string[]; min: string; mid?: string; max: string }) {
  return (
    <Box>
      <Box sx={{ height: 7, borderRadius: 999, background: `linear-gradient(90deg, ${stops.join(", ")})`, border: `1px solid ${SHELL_HAIRLINE}` }} />
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.35, fontSize: 10, color: SHELL_DIM, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        <span>{min}</span>
        {mid ? <span>{mid}</span> : null}
        <span>{max}</span>
      </Box>
    </Box>
  );
}

export function MapLegend() {
  const activeLayerIds = useStore((s) => s.activeLayerIds);
  // A compact icon button that opens the legend as a popover, matching the base
  // map control beside it (Google Maps / Felt pattern). Keeps the map clear
  // instead of a large card standing open over it.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const has = (id: string) => activeLayerIds.has(id);

  const income = layerById("household_income")?.style.colorRamp;
  const growth = layerById("population_growth")?.style.colorRamp;

  const showMarkers = has("school_locations");

  return (
    <>
      <Tooltip title="Legend" placement="left">
        <IconButton
          aria-label="Legend"
          onClick={(e) => setAnchor(e.currentTarget)}
          size="small"
          sx={{ width: 40, height: 40, borderRadius: 0, color: open ? ACCENT : SHELL_DIM, "&:hover": { bgcolor: "#f4f5f7", color: SHELL_ON } }}
        >
          <ListIcon size={18} aria-hidden />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { role: "region", "aria-label": "Map legend", sx: { mt: 1, borderRadius: 0, border: `1px solid ${SHELL_HAIRLINE}`, boxShadow: "var(--shadow-card)", width: 256, maxWidth: "calc(100vw - 16px)", maxHeight: "min(66vh, 560px)", overflowY: "auto" } } }}
      >
        <Box sx={{ px: 1.75, pt: 1.5, pb: 1.5 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: SHELL_ON, mb: 1.25 }}>Legend</Typography>
          {showMarkers && (
            <>
              <Section title="Grade" info="Color + letter. A (green) to F (red); I / NR / NG in grey (incomplete, not rated, no grade).">
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.45 }}>
                  {GRADE_DOMAIN.map((g) => <GradeDot key={g} grade={g} />)}
                </Box>
              </Section>

              <Section title="Type" info="Shape shows school type at every zoom; the grade letter is added when you zoom into a neighborhood.">
                <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 0.6, rowGap: 0.4 }}>
                  {SHAPE_LEGEND.map((s) => (
                    <Box key={s.label} sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                      <ShapeSwatch shape={s.shape} />
                      <Typography sx={{ fontSize: 11, color: SHELL_ON, fontWeight: 500 }}>{s.label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Section>

              <Section title="Markers">
                <Row
                  swatch={<Box component="span" sx={{ width: 11, height: 11, borderRadius: "50%", bgcolor: CO_LOC_TEAL, border: "1.5px solid #fff", boxShadow: "0 0 0 0.5px rgba(15,23,42,0.2)", flex: "none" }} />}
                  label="Co-location"
                  info="Co-location candidate: an underused district school (utilization at or below 75%, or 400+ surplus stations) inside a School of Hope siting area. The building-age rule is not checked here; see a school's details."
                />
                {has("existing_soh") && (
                  <Row swatch={<span style={{ color: "#B45309", fontSize: 13, lineHeight: 1 }}>★</span>} label="School of Hope" info="An existing School of Hope (loan-fund site)." />
                )}
              </Section>
            </>
          )}

          {!showMarkers && has("existing_soh") && (
            <Section title="Markers">
              <Row swatch={<span style={{ color: "#B45309", fontSize: 13, lineHeight: 1 }}>★</span>} label="School of Hope" />
            </Section>
          )}

          {has("plp_radius") && (
            <Section title="Eligibility area" info="The dissolved union of 5-mile radii around persistently low-performing schools.">
              <Row swatch={<Box component="span" sx={{ width: 14, height: 14, borderRadius: "50%", border: "1.5px solid #D32F2F", bgcolor: "rgba(211,47,47,0.14)" }} />} label="Within 5 mi of a PLP school" />
            </Section>
          )}

          {has("household_income") && income && (
            <Section title="Median household income" info="ACS 2019-2023, census-tract level.">
              <Ramp stops={income.stops} min={fmtUsd(income.domain[0])} max={fmtUsd(income.domain[income.domain.length - 1])} />
            </Section>
          )}

          {has("population_growth") && growth && (
            <Section title="Population growth" info="Red decline, grey flat, green growth (county level).">
              <Ramp stops={growth.stops} min={fmtPct(growth.domain[0])} mid={fmtPct(growth.domain[1])} max={`${fmtPct(growth.domain[growth.domain.length - 1])}+`} />
            </Section>
          )}

          {(has("opportunity_zones") || has("drive_time_reach")) && (
            <Section title="Areas">
              {has("opportunity_zones") && <Row swatch={<AreaSwatch color="rgba(255,204,128,0.6)" border="#FF8F00" />} label="Opportunity zone" />}
              {has("drive_time_reach") && <Row swatch={<AreaSwatch color="rgba(0,137,123,0.12)" border="#00897B" />} label="15-min drive reach" />}
            </Section>
          )}

          {(has("congressional_districts") || has("state_senate_districts") || has("state_house_districts") || has("board_districts")) && (
            <Section title="District boundaries">
              {has("congressional_districts") && <Row swatch={<LineSwatch color="#512DA8" />} label="Congressional" />}
              {has("state_senate_districts") && <Row swatch={<LineSwatch color="#7E57C2" />} label="State Senate" />}
              {has("state_house_districts") && <Row swatch={<LineSwatch color="#B39DDB" />} label="State House" />}
              {has("board_districts") && <Row swatch={<LineSwatch color="#6D28D9" />} label="School board" />}
            </Section>
          )}
          {/* Empty state: no markers layer and nothing else drawn. */}
          {!showMarkers && !has("existing_soh") && !has("plp_radius") && !has("household_income")
            && !has("population_growth") && !has("opportunity_zones")
            && !has("drive_time_reach") && !has("congressional_districts") && !has("state_senate_districts")
            && !has("state_house_districts") && !has("board_districts") && (
            <Typography sx={{ fontSize: 12, color: SHELL_DIM, lineHeight: 1.5 }}>
              No map layers are on. Turn on a layer from the left panel to see what it draws here.
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  );
}
