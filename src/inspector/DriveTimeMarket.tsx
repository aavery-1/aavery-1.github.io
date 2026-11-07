// Drive-time market: who lives within a 5, 10, and 15 minute drive of this
// school in typical school-morning traffic, the companion to the straight-line
// radius table above it. Areas come from geo/driveTime.ts (Mapbox traffic,
// checked and adjusted against Google); population inside each uses the same
// Census dasymetric method as the rings, so the two tables are comparable. The table and the map layer
// share one toggle ("Drive times" in Map layers), so what the table counts is
// what the map draws.

import { useEffect } from "react";
import { InlineLoading } from "@carbon/react";
import { Car as CarIcon } from "@carbon/icons-react";
import { useInspectorSections } from "./inspectorSections";
import { DepartureControl } from "../tools/DepartureControl";
import { departureLabel } from "../geo/driveTime";
import { useStore } from "../store";
import { useDriveTimes, DRIVE_LAYER_ID, driveMethodNote, type DriveContour } from "../geo/driveTime";
import type { AreaDemographics } from "../geo/populationPoints";

export { DRIVE_LAYER_ID, driveMethodNote };

const intFmt = (n: number) => n.toLocaleString("en-US");
const moeFmt = (n: number) => `±${n.toLocaleString("en-US")}`;
const NA = <span className="insp-demo__na">n/a</span>;

function Cell({ value, moe }: { value: React.ReactNode; moe?: string | null }) {
  return (
    <td className="insp-demo__cell">
      <span className="insp-demo__val">{value}</span>
      {moe ? <span className="insp-demo__moe">{moe}</span> : null}
    </td>
  );
}

type Row = { label: React.ReactNode; render: (d: AreaDemographics) => { value: React.ReactNode; moe?: string | null } };
const ROWS: Row[] = [
  { label: "Population", render: (d) => ({ value: intFmt(d.total_pop), moe: d.total_pop > 0 ? moeFmt(d.total_pop_moe) : null }) },
  { label: <>K-8 age <span className="insp-demo__hint">(5-14)</span></>, render: (d) => ({ value: intFmt(d.k8_pop), moe: d.k8_pop > 0 ? moeFmt(d.k8_pop_moe) : null }) },
  { label: "Median income", render: (d) => d.median_income == null ? { value: NA } : { value: `$${intFmt(d.median_income)}`, moe: d.median_income_moe != null ? moeFmt(d.median_income_moe) : null } },
  { label: "% Black", render: (d) => d.pct_black == null ? { value: NA } : { value: `${d.pct_black.toFixed(1)}%`, moe: d.pct_black_moe != null ? `±${d.pct_black_moe.toFixed(1)}` : null } },
  { label: "% Hispanic", render: (d) => d.pct_hispanic == null ? { value: NA } : { value: `${d.pct_hispanic.toFixed(1)}%`, moe: d.pct_hispanic_moe != null ? `±${d.pct_hispanic_moe.toFixed(1)}` : null } },
];

function DriveTable({ contours }: { contours: DriveContour[] }) {
  return (
    <div className="insp-demo__scroll">
      <table className="insp-demo__table">
        <thead>
          <tr>
            <th scope="col" className="insp-demo__rowhead"> </th>
            {contours.map((c) => (
              <th key={c.minutes} scope="col" className="insp-demo__colhead">
                <span className={`insp-drive__key insp-drive__key--${c.minutes}`} aria-hidden="true" />
                {c.minutes} min
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr key={i}>
              <th scope="row" className="insp-demo__rowhead">{row.label}</th>
              {contours.map((c) => {
                if (!c.demographics) return <Cell key={c.minutes} value={NA} />;
                const { value, moe } = row.render(c.demographics);
                return <Cell key={c.minutes} value={value} moe={moe} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The drive-times switch in the card's toolbar: a ghost button that reads as
// pressed while the mode is on (Carbon's selected-ghost treatment). Turning it on
// computes this school's areas and draws them.
export function DriveTimeToggle({ msid, lng, lat }: { msid: string; lng: number; lat: number }) {
  const layerOn = useStore((s) => s.activeLayerIds.has(DRIVE_LAYER_ID));
  const toggleLayer = useStore((s) => s.toggleLayer);
  const request = useDriveTimes((s) => s.request);
  useEffect(() => {
    if (layerOn) request(msid, lng, lat);
  }, [layerOn, msid, lng, lat, request]);
  return (
    <button
      type="button"
      className={`insp-feature${layerOn ? " insp-feature--on" : ""}`}
      aria-pressed={layerOn}
      title={layerOn ? "Hide drive times" : "Show 5, 10, and 15 minute drive times in morning traffic"}
      onClick={() => toggleLayer(DRIVE_LAYER_ID)}
    >
      <CarIcon size={20} aria-hidden="true" />
      <span>Drive times</span>
    </button>
  );
}

// One quiet line under the toolbar, only while drive times are on: progress,
// then the headline number, which opens the full table.
export function DriveTimeStatus({ msid }: { msid: string }) {
  const depart = useDriveTimes((s) => s.depart);
  const layerOn = useStore((s) => s.activeLayerIds.has(DRIVE_LAYER_ID));
  const entry = useDriveTimes((s) => s.byMsid[msid]);
  const reveal = useInspectorSections((s) => s.reveal);
  if (!layerOn || !entry) return null;
  if (entry.status === "loading") return <InlineLoading className="insp-drive-status" description={entry.step} />;
  if (entry.status === "error") return <p className="insp-drive-status insp-drive-status--err">Drive times unavailable. {entry.message}</p>;
  const k8 = entry.result.contours.find((c) => c.minutes === 15)?.demographics?.k8_pop ?? null;
  return (
    <p className="insp-drive-status">
      <button type="button" className="insp-drive-status__link" onClick={() => reveal("drive")}>
        {k8 != null ? `${k8.toLocaleString("en-US")} K-8 age within 15 min` : "See drive-time numbers"}
      </button>
      {entry.result.engine !== "valhalla" && <span className="insp-drive-status__when"> · leaving {departureLabel(depart)}</span>}
    </p>
  );
}

export function DriveTimeMarket({ msid, lng, lat, open = true }: { msid: string; lng: number; lat: number; open?: boolean }) {
  const entry = useDriveTimes((s) => s.byMsid[msid]);
  const request = useDriveTimes((s) => s.request);
  // Opening the section IS the request: compute (or reuse) this school's drive
  // times for the chosen departure. Showing them on the map stays a separate
  // choice (the Drive times button in the strip).
  useEffect(() => {
    if (open) request(msid, lng, lat);
  }, [open, msid, lng, lat, request]);

  const ready = entry?.status === "ready" ? entry.result : null;
  const demoMissing = ready ? ready.contours.some((c) => !c.demographics) : false;

  return (
    <div className="insp-demo insp-drive">
      <DepartureControl id={`card-depart-${msid}`} />

      {entry?.status === "loading" && (
        <InlineLoading description={entry.step} style={{ marginTop: 8 }} />
      )}

      {entry?.status === "error" && (
        <div className="insp-demo__warn" role="alert">
          Drive times are unavailable right now. {entry.message}{" "}
          <button type="button" className="insp-drive__retry" onClick={() => request(msid, lng, lat)}>Try again</button>
        </div>
      )}

      {ready && (
        <>
          <DriveTable contours={ready.contours} />
          {demoMissing && (
            <p className="insp-demo__warn">Population figures could not load; the drive-time areas on the map are still accurate.</p>
          )}
          {ready.engine === "valhalla"
            ? <p className="insp-demo__warn">Empty roads, no traffic: real reach is smaller.</p>
            : <p className="insp-demo__foot" title={driveMethodNote(ready)}>
                Mapbox traffic, checked against Google{ready.calibration ? ` (±${ready.calibration.typicalErrorMin.toFixed(1)} min)` : ""}
              </p>}
        </>
      )}
    </div>
  );
}
