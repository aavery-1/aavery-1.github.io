// Time-of-day choice for drive times: school drop-off (home to campus, 8am) or pickup (campus to home, 4pm), the two
// times the shared rules define (GEO_RULESET.md rule 8), so a school's areas match Grove's for the same choice. One
// Carbon inline dropdown, shared by the map's drive-time bar and the school card so the two can never disagree.

import { Dropdown } from "@carbon/react";
import { useDriveTimes, WINDOW_OPTIONS, windowLabel, type DriveWindow } from "../geo/driveTime";
import "./DepartureControl.css";

export function DepartureControl({ id, compact = false }: { id: string; compact?: boolean }) {
  const window = useDriveTimes((s) => s.window);
  const setWindow = useDriveTimes((s) => s.setWindow);
  return (
    <div className={`departure${compact ? " departure--compact" : ""}`} role="group" aria-label="Time of day for drive times">
      <Dropdown
        id={`${id}-window`}
        type="inline"
        size="sm"
        titleText="Time of day"
        hideLabel
        label="Time of day"
        items={WINDOW_OPTIONS}
        itemToString={(w: DriveWindow | null) => (w == null ? "" : windowLabel(w))}
        selectedItem={window}
        onChange={({ selectedItem }: { selectedItem: DriveWindow | null }) => {
          if (selectedItem != null) setWindow(selectedItem);
        }}
      />
    </div>
  );
}
