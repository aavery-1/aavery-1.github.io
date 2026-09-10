// Map tools: measure distance and radius-from-a-point. Both are geodesically
// correct (WGS84 ellipsoidal distance; a true geodesic buffer ring). The radius
// tool doubles as the map's area FILTER: "Filter to this area" commits its circle
// as the drawnBoundary ring, so one circle both measures and filters (the old
// freehand draw-a-boundary tool was removed; a hand-clicked polygon self-
// intersected and was fiddly). The committed filter clears from the active-filter
// chip strip as well as the tool.
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

import { useEffect, useMemo } from "react";
import { Button, IconButton, SelectableTag, Tooltip } from "@carbon/react";
import { Ruler as StraightenIcon, CenterCircle as RadioButtonUncheckedIcon, Undo as UndoIcon } from "@carbon/icons-react";
import { useStore, type ActiveTool } from "../store";
import { useData } from "../data/DataContext";
import { pathDistanceMiles, distanceMiles, milesToMeters, type LngLat } from "../geo/measure";
import { useDriveTime, type DriveTime } from "../map/useDriveTime";
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

// Second readout line under the geodesic distance: the on-road DRIVING time and
// distance for the same path. Fails soft (see useDriveTime): if the key lacks the
// Distance Matrix API it says so quietly rather than breaking the ruler.
function DriveDetail({ drive }: { drive: DriveTime }) {
  let text: string;
  if (drive.status === "ok") text = `Driving ${Math.round(drive.minutes)} min / ${drive.miles.toFixed(1)} mi`;
  else if (drive.status === "loading") text = "Driving time...";
  else if (drive.status === "error") text = "No driving route";
  else if (drive.status === "unavailable") text = "Driving time unavailable";
  else return null;
  return <span className="toolbar-detail toolbar-detail--mono toolbar-dim" style={{ display: "block", marginTop: 2 }}>{text}</span>;
}

function MeasureControls() {
  const measurePoints = useStore((s) => s.measurePoints);
  const clearMeasure = useStore((s) => s.clearMeasure);
  const undoMeasurePoint = useStore((s) => s.undoMeasurePoint);
  const pts: LngLat[] = measurePoints.map((p) => [p.lng, p.lat]);
  const miles = pathDistanceMiles(pts);
  const meters = milesToMeters(miles);
  const drive = useDriveTime(measurePoints);

  return (
    <ToolBar
      icon={<StraightenIcon size={16} />}
      title="Measure distance"
      detail={measurePoints.length >= 2 ? (
        <>
          <Detail mono>{miles.toFixed(2)} mi <span className="toolbar-dim">/ {(meters / 1000).toFixed(2)} km · geodesic</span></Detail>
          <DriveDetail drive={drive} />
        </>
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

// The current radius circle as a closed LatLng ring, for committing as the area
// filter. geodesicBufferMiles returns a GeoJSON polygon; take its outer ring.
function circleRing(center: LngLat, miles: number): { lat: number; lng: number }[] {
  return geodesicBufferMiles(center, miles).geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
}

function RadiusControls() {
  const radiusCenter = useStore((s) => s.radiusCenter);
  const radiusMiles = useStore((s) => s.radiusMiles);
  const setRadiusMiles = useStore((s) => s.setRadiusMiles);
  const setRadius = useStore((s) => s.setRadius);
  const drawnBoundary = useStore((s) => s.drawnBoundary);
  const setDrawnBoundary = useStore((s) => s.setDrawnBoundary);
  const clearDrawnBoundary = useStore((s) => s.clearDrawnBoundary);
  const { schools, income } = useData();

  const filtering = Boolean(drawnBoundary && drawnBoundary.length >= 3);

  // Keep a committed filter in sync while the circle is edited: moving the center
  // or changing the radius re-commits the ring. Reads the live flag so it never
  // resurrects a filter the user just cleared, and never loops (deps exclude the
  // boundary it writes).
  useEffect(() => {
    if (!radiusCenter) return;
    if (useStore.getState().drawnBoundary) {
      setDrawnBoundary(circleRing([radiusCenter.lng, radiusCenter.lat], radiusMiles));
    }
  }, [radiusCenter, radiusMiles, setDrawnBoundary]);

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
        {radiusCenter && (
          <Button
            kind={filtering ? "tertiary" : "primary"}
            size="sm"
            onClick={() => filtering
              ? clearDrawnBoundary()
              : setDrawnBoundary(circleRing([radiusCenter.lng, radiusCenter.lat], radiusMiles))}
          >
            {filtering ? "Stop filtering" : "Filter to this area"}
          </Button>
        )}
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

export function Toolbar() {
  const activeTool = useStore((s) => s.activeTool);
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  const viewMode = useStore((s) => s.viewMode);

  // The inspector floats over the map's right edge; when it is open the active
  // bar insets its right boundary so its actions never slide behind the panel.
  const inspectorOnMap = Boolean(selectedSchoolMsid) && viewMode === "map";

  // Active-tool control only: a slim bar at the top EDGE, centered within the map
  // minus the top-right controls (and the inspector when it is open), so it never
  // sits over the map surface the tool needs you to click. The tool BUTTONS now
  // live in the top-right control cluster (see MapToolButtons), grouped with the
  // legend and base-map controls instead of a separate floating stack.
  if (activeTool === "none") return null;
  return (
    <div className={`toolbar-active${inspectorOnMap ? " toolbar-active--inspector" : ""}`}>
      {activeTool === "measure" && <MeasureControls />}
      {activeTool === "radius" && <RadiusControls />}
    </div>
  );
}

// The Distance / Radius tool buttons, placed by App INSIDE the top-right
// map-controls group so they read as part of the same Carbon control cluster as
// the legend and base-map buttons, rather than a separate, less-elegant floating
// menu. Icon-only (label in the tooltip) to match the neighbours; the active tool
// gets a filled state.
export function MapToolButtons() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);
  const toggle = (tool: ActiveTool) => setTool(activeTool === tool ? "none" : tool);
  return (
    <>
      <Tooltip label="Measure distance" align="left">
        <button type="button" className={`map-ctrl-btn${activeTool === "measure" ? " map-ctrl-btn--active" : ""}`}
          aria-label="Measure distance: trace a path (geodesic)" aria-pressed={activeTool === "measure"} onClick={() => toggle("measure")}>
          <StraightenIcon size={18} />
        </button>
      </Tooltip>
      <span className="map-ctrl-sep" aria-hidden />
      <Tooltip label="Radius tool" align="left">
        <button type="button" className={`map-ctrl-btn${activeTool === "radius" ? " map-ctrl-btn--active" : ""}`}
          aria-label="Radius from a point: measure its area, or filter to inside it" aria-pressed={activeTool === "radius"} onClick={() => toggle("radius")}>
          <RadioButtonUncheckedIcon size={18} />
        </button>
      </Tooltip>
    </>
  );
}
