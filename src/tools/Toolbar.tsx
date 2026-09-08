// Map tools: measure distance, radius-from-a-point, and draw-a-boundary. All are
// geodesically correct (WGS84 ellipsoidal distance; a true geodesic buffer ring).
//
// The tool BUTTONS live bottom-right with the other map controls. When a tool is
// active its control appears as a SLIM HORIZONTAL BAR pinned to the top-center
// edge of the map, NOT a card over the middle of the map: these tools require
// clicking points on the map, so the control must stay out of the click surface.
// The bar carries the mode label, a one-line instruction or the live readout, and
// the actions (undo / clear / done), so it is the only mode indicator needed.
//
// Reskinned to IBM Carbon: Button / IconButton / SelectableTag / Tooltip plus
// custom chrome in Toolbar.carbon.css. No MUI, no sx, no muiTheme. The vertical
// tool stack keeps custom toggle buttons (a Carbon ContentSwitcher is horizontal
// only and would not match the map-control look), preserving aria-pressed and the
// exact click-to-toggle behavior.

import { useMemo } from "react";
import { Button, IconButton, SelectableTag, Tooltip } from "@carbon/react";
import { Ruler as StraightenIcon, CenterCircle as RadioButtonUncheckedIcon, Draw as GestureIcon, Undo as UndoIcon } from "@carbon/icons-react";
import { useStore, type ActiveTool } from "../store";
import { useData } from "../data/DataContext";
import { pathDistanceMiles, distanceMiles, milesToMeters, type LngLat } from "../geo/measure";
import { geodesicBufferMiles, areaSquareMiles } from "../geo/buffer";
import { apportionByArea } from "../geo/intersect";
import { ExportButton } from "./ExportButton";
import type { SchoolFeature } from "../data/types";
import "./Toolbar.carbon.css";

const RADII = [1, 2, 3, 5, 10];

// Shared shell for an active-tool bar: a slim horizontal card. Left: icon +
// title + a compact detail line. Right: the actions. Wraps gracefully on narrow.
function ToolBar({ icon, title, detail, actions }: {
  icon: React.ReactNode; title: string; detail: React.ReactNode; actions: React.ReactNode;
}) {
  return (
    <div className="toolbar-bar">
      <span className="toolbar-bar__icon">{icon}</span>
      <div className="toolbar-bar__body">
        <p className="toolbar-bar__title">{title}</p>
        <div className="toolbar-bar__detail-wrap">{detail}</div>
      </div>
      <span className="toolbar-bar__rule" aria-hidden="true" />
      <div className="toolbar-bar__actions">{actions}</div>
    </div>
  );
}

function Detail({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span className={mono ? "toolbar-detail toolbar-detail--mono" : "toolbar-detail"}>
      {children}
    </span>
  );
}

function DoneButton({ label = "Done" }: { label?: string }) {
  const setTool = useStore((s) => s.setTool);
  return (
    <Button kind="tertiary" size="sm" onClick={() => setTool("none")}>{label}</Button>
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
        <Detail mono>{miles.toFixed(2)} mi <span className="toolbar-dim">/ {(meters / 1000).toFixed(2)} km · geodesic</span></Detail>
      ) : (
        <Detail>{measurePoints.length === 1 ? "Click another point to measure." : "Click points on the map to trace a path."}</Detail>
      )}
      actions={<>
        <IconButton label="Undo last point" kind="ghost" size="sm" align="bottom" onClick={undoMeasurePoint} disabled={measurePoints.length === 0}>
          <UndoIcon size={16} />
        </IconButton>
        <Button kind="ghost" size="sm" className="toolbar-btn-muted" onClick={clearMeasure} disabled={measurePoints.length === 0}>Clear</Button>
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
        <div className="toolbar-radius">
          <div className="toolbar-radius__chips">
            {RADII.map((r) => (
              <SelectableTag key={r} size="sm" text={`${r} mi`}
                selected={radiusMiles === r}
                onClick={() => setRadiusMiles(r)} />
            ))}
          </div>
          {radiusCenter && analysis ? (
            <Detail mono>
              {analysis.areaMi2.toFixed(1)} mi² · <span className="toolbar-strong">{analysis.inside.length.toLocaleString("en-US")}</span> schools
              {analysis.reach ? <> · <span className="toolbar-strong">{Math.round(analysis.reach.total).toLocaleString("en-US")}</span> <span className="toolbar-dim">school-age pop</span></> : null}
            </Detail>
          ) : (
            <Detail>Click the map to drop the center.</Detail>
          )}
        </div>
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
        {radiusCenter && <Button kind="ghost" size="sm" className="toolbar-btn-muted" onClick={() => setRadius(null)}>Clear</Button>}
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
        <IconButton label="Undo last point" kind="ghost" size="sm" align="bottom" onClick={undoDrawPoint} disabled={n === 0}>
          <UndoIcon size={16} />
        </IconButton>
        <Button kind="ghost" size="sm" className="toolbar-btn-muted" onClick={clearDrawnBoundary}>Clear</Button>
        <Button kind="ghost" size="sm" className="toolbar-btn-muted" onClick={() => setTool("none")}>Cancel</Button>
        <Button kind="primary" size="sm" onClick={finishDraw} disabled={n < 3}>Finish</Button>
      </>}
    />
  );
}

export function Toolbar() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);

  const toggle = (tool: ActiveTool) => setTool(activeTool === tool ? "none" : tool);

  return (
    <>
      {/* Active-tool control: a slim bar at the top-center EDGE, so it never sits
          over the map surface the tool needs you to click. */}
      {activeTool !== "none" && (
        <div className="toolbar-active">
          {activeTool === "measure" && <MeasureControls />}
          {activeTool === "radius" && <RadiusControls />}
          {activeTool === "draw" && <DrawControls />}
        </div>
      )}

      {/* Tool buttons: vertical white rounded-square stack, bottom-right, matching
          the zoom / full-screen / compass controls below it. */}
      <div className="toolbar-stack">
        <div className="toolbar-group">
          <Tooltip label="Measure distance (geodesic)" align="left">
            <button type="button" className={`toolbar-tool${activeTool === "measure" ? " toolbar-tool--active" : ""}`}
              aria-label="Measure distance" aria-pressed={activeTool === "measure"}
              onClick={() => toggle("measure")}>
              <StraightenIcon size={18} />
            </button>
          </Tooltip>
          <Tooltip label="Radius from a point (geodesic buffer)" align="left">
            <button type="button" className={`toolbar-tool${activeTool === "radius" ? " toolbar-tool--active" : ""}`}
              aria-label="Radius from a point" aria-pressed={activeTool === "radius"}
              onClick={() => toggle("radius")}>
              <RadioButtonUncheckedIcon size={18} />
            </button>
          </Tooltip>
          <Tooltip label="Draw a boundary (filter to the area)" align="left">
            <button type="button" className={`toolbar-tool${activeTool === "draw" ? " toolbar-tool--active" : ""}`}
              aria-label="Draw a boundary" aria-pressed={activeTool === "draw"}
              onClick={() => toggle("draw")}>
              <GestureIcon size={18} />
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  );
}
