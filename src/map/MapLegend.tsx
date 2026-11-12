// Map legend. Explains every encoding currently drawn on the map: grade
// color+letter, school-type shape, the co-location dot, the School of Hope star,
// the PLP eligibility area, and any active overlay (income / growth ramps,
// opportunity zones, drive-time reach, boundary lines). Sections appear only when
// their layer is active, so the legend always matches what is on screen.
//
// Real IBM Carbon: Popover + IconButton + PopoverContent, no MUI, mirroring
// MapLayersControl beside it. Type and chrome colors follow Carbon (Gray 10)
// tokens (MapLegend.carbon.css); the grade fills, co-location teal, and School
// of Hope amber are DATA encodings set inline from the same source of truth the
// map draws from. Each channel sits under a hairline divider so it reads fast.
// No em dashes.

import { useState } from "react";
import { IconButton, Popover, PopoverContent } from "@carbon/react";
import { Legend as LegendIcon } from "@carbon/icons-react";
import { useStore } from "../store";
import { layerById } from "../config/layers";
import { SHAPE_LEGEND, shapeSvgElement, iconForBadge, type MarkerShape, type MarkerBadge } from "./markerShapes";
import { GradePin } from "./GradePin";
import "./MapLegend.carbon.css";

const SHAPE_STROKE = "#525252"; // Carbon Gray 70
const SHAPE_FILL = "#e0e0e0";   // Carbon Gray 20

// A to F read as one run; the ungraded set (I / NR / NG) sits after a small gap.
const GRADES_AF = ["A", "B", "C", "D", "F"] as const;
const GRADES_UNGRADED = ["I", "NR", "NG"] as const;

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}
function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`;
}

// One grade swatch: the map's own marker (circle, grade color, white keyline,
// letter), drawn by the shared GradePin so the legend is the pin.
function GradeDot({ grade }: { grade: (typeof GRADES_AF)[number] | (typeof GRADES_UNGRADED)[number] }) {
  return <GradePin grade={grade} size={22} />;
}

// A corner badge exactly as the map draws it (the same rasterized icon).
function Badge({ badge }: { badge: MarkerBadge }) {
  return <img className="map-legend-badge" src={iconForBadge(badge).url} width={16} height={16} alt="" aria-hidden />;
}

// A neutral shape swatch matching the map's school-type markers.
function ShapeSwatch({ shape }: { shape: MarkerShape }) {
  return (
    <svg viewBox="0 0 100 100" width="15" height="15" aria-hidden>
      <g fill={SHAPE_FILL} stroke={SHAPE_STROKE} strokeWidth={9} strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: shapeSvgElement(shape) }} />
    </svg>
  );
}

function Ramp({ stops, min, mid, max }: { stops: string[]; min: string; mid?: string; max: string }) {
  return (
    <>
      <div className="map-legend-ramp-bar" style={{ background: `linear-gradient(90deg, ${stops.join(", ")})` }} />
      <div className="map-legend-ramp-scale">
        <span>{min}</span>
        {mid ? <span>{mid}</span> : null}
        <span>{max}</span>
      </div>
    </>
  );
}

export function MapLegend() {
  const activeLayerIds = useStore((s) => s.activeLayerIds);
  const [open, setOpen] = useState(false);
  const has = (id: string) => activeLayerIds.has(id);

  const income = layerById("household_income")?.style.colorRamp;
  const growth = layerById("population_growth")?.style.colorRamp;
  const showMarkers = has("school_locations");

  const hasBoundaries =
    has("congressional_districts") || has("state_senate_districts") ||
    has("state_house_districts") || has("board_districts");
  const hasAreas = has("opportunity_zones") || has("drive_time_reach");
  const empty =
    !showMarkers && !has("plp_radius") &&
    !has("household_income") && !has("population_growth") && !hasAreas && !hasBoundaries;

  return (
    <Popover open={open} onRequestClose={() => setOpen(false)} align="bottom-right" dropShadow>
      <IconButton
        label="Legend"
        aria-label="Legend: what the map's colors, shapes, and markers mean"
        kind="ghost"
        size="md"
        align="left"
        className={`map-legend-trigger${open ? " map-legend-trigger--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <LegendIcon size={18} />
      </IconButton>
      <PopoverContent>
        <div className="map-legend-panel" role="region" aria-label="Map legend">
          <h3 className="map-legend-heading">Legend</h3>

          {showMarkers && (
            <>
              <section className="map-legend-section">
                <span className="map-legend-label">Grade</span>
                <div className="map-legend-grades">
                  <span className="map-legend-grade-run">
                    {GRADES_AF.map((g) => <GradeDot key={g} grade={g} />)}
                  </span>
                  <span className="map-legend-grade-run">
                    {GRADES_UNGRADED.map((g) => <GradeDot key={g} grade={g} />)}
                  </span>
                </div>
              </section>

              <section className="map-legend-section">
                <span className="map-legend-label">School type</span>
                <ul className="map-legend-shapes">
                  {SHAPE_LEGEND.map((s) => (
                    <li key={s.label} className="map-legend-shape">
                      <ShapeSwatch shape={s.shape} />
                      <span>{s.label}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="map-legend-section">
                <span className="map-legend-label">Markers</span>
                <ul className="map-legend-rows">
                  <li className="map-legend-row" title="Co-location candidate: an underused district school (utilization at or below 75%, or 400+ surplus stations) inside a School of Hope siting area. The building-age rule is checked in a school's details.">
                    <span className="map-legend-swatch"><Badge badge="coloc" /></span>
                    <span>Co-location candidate</span>
                  </li>
                  <li className="map-legend-row" title="A School of Hope run by a state-designated hope operator (Mater and others), or a Success Academy approved co-location host (MDCPS Board, Apr 22, 2026). Flagged with a gold star.">
                    <span className="map-legend-swatch"><Badge badge="star" /></span>
                    <span>School of Hope</span>
                  </li>
                  <li className="map-legend-row" title="A current KIPP Miami campus, an existing School of Hope shown with reduced data.">
                    <span className="map-legend-swatch"><Badge badge="kipp-current" /></span>
                    <span>KIPP campus</span>
                  </li>
                  <li className="map-legend-row" title="A vacant or underused MDCPS facility that KIPP Miami has requested for a School of Hope. The dot sits on the building's current host school.">
                    <span className="map-legend-swatch"><Badge badge="kipp-requested" /></span>
                    <span>KIPP requested building</span>
                  </li>
                </ul>
              </section>
            </>
          )}

          {has("plp_radius") && (
            <section className="map-legend-section">
              <span className="map-legend-label">Eligibility area</span>
              <ul className="map-legend-rows">
                <li className="map-legend-row" title="The merged 5-mile radii around persistently low-performing schools.">
                  <span className="map-legend-swatch">
                    <span className="map-legend-dot map-legend-area" style={{ borderRadius: "50%", border: "1.5px solid #DA1E28", background: "rgba(218,30,40,0.1)", boxShadow: "none", width: 14, height: 14 }} />
                  </span>
                  <span>Within 5 mi of a PLP school</span>
                </li>
              </ul>
            </section>
          )}

          {has("household_income") && income && (
            <section className="map-legend-section">
              <span className="map-legend-label">Median household income</span>
              <Ramp stops={income.stops} min={fmtUsd(income.domain[0])} max={fmtUsd(income.domain[income.domain.length - 1])} />
            </section>
          )}

          {has("population_growth") && growth && (
            <section className="map-legend-section">
              <span className="map-legend-label">Population growth</span>
              <Ramp stops={growth.stops} min={fmtPct(growth.domain[0])} mid={fmtPct(growth.domain[1])} max={`${fmtPct(growth.domain[growth.domain.length - 1])}+`} />
            </section>
          )}

          {hasAreas && (
            <section className="map-legend-section">
              <span className="map-legend-label">Areas</span>
              <ul className="map-legend-rows">
                {has("opportunity_zones") && (
                  <li className="map-legend-row">
                    <span className="map-legend-swatch">
                      <span className="map-legend-area" style={{ display: "block", background: "rgba(255,204,128,0.6)", border: "1.5px solid #FF8F00" }} />
                    </span>
                    <span>Opportunity zone</span>
                  </li>
                )}
                {has("drive_time_reach") && (
                  <li className="map-legend-row">
                    <span className="map-legend-swatch">
                      <span className="map-legend-area" style={{ display: "block", background: "linear-gradient(90deg, rgba(32,39,93,0.35), rgba(74,111,181,0.25), rgba(82,195,237,0.2))", border: "1.5px solid #20275d" }} />
                    </span>
                    <span>Drive time 5 / 10 min (school day)</span>
                  </li>
                )}
              </ul>
            </section>
          )}

          {hasBoundaries && (
            <section className="map-legend-section">
              <span className="map-legend-label">District boundaries</span>
              <ul className="map-legend-rows">
                {has("congressional_districts") && (
                  <li className="map-legend-row">
                    <span className="map-legend-swatch"><span className="map-legend-line" style={{ borderTop: "2.5px solid #512DA8" }} /></span>
                    <span>Congressional</span>
                  </li>
                )}
                {has("state_senate_districts") && (
                  <li className="map-legend-row">
                    <span className="map-legend-swatch"><span className="map-legend-line" style={{ borderTop: "2.5px solid #7E57C2" }} /></span>
                    <span>State Senate</span>
                  </li>
                )}
                {has("state_house_districts") && (
                  <li className="map-legend-row">
                    <span className="map-legend-swatch"><span className="map-legend-line" style={{ borderTop: "2.5px solid #B39DDB" }} /></span>
                    <span>State House</span>
                  </li>
                )}
                {has("board_districts") && (
                  <li className="map-legend-row">
                    <span className="map-legend-swatch"><span className="map-legend-line" style={{ borderTop: "2.5px solid #6D28D9" }} /></span>
                    <span>School board</span>
                  </li>
                )}
              </ul>
            </section>
          )}

          {empty && (
            <p className="map-legend-empty">
              No map layers are on. Turn on a layer from the left panel to see what it draws here.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
