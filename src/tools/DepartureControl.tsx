// Departure picker for drive times: day of week + time of day, as two Carbon
// inline dropdowns. "Leaving Tue 7:30am" reads as one phrase, and either half
// changes in one click. Times run 5:00am to 9:00pm in 15-minute steps (covers
// school drop-off, dismissal, and evening events). Shared by the map's drive-time
// bar and the school card so the two can never disagree.

import { Dropdown } from "@carbon/react";
import { useDriveTimes, DAY_NAMES, clockLabel } from "../geo/driveTime";
import "./DepartureControl.css";

const DAYS = [1, 2, 3, 4, 5, 6, 0]; // Monday first, the way a work week reads
const TIMES: number[] = [];
for (let m = 5 * 60; m <= 21 * 60; m += 15) TIMES.push(m);

export function DepartureControl({ id, compact = false }: { id: string; compact?: boolean }) {
  const depart = useDriveTimes((s) => s.depart);
  const setDepart = useDriveTimes((s) => s.setDepart);
  return (
    <div className={`departure${compact ? " departure--compact" : ""}`} role="group" aria-label="Departure time for drive times">
      <span className="departure__lead">Leaving</span>
      <Dropdown
        id={`${id}-day`}
        type="inline"
        size="sm"
        titleText="Day"
        hideLabel
        label="Day"
        items={DAYS}
        itemToString={(d: number | null) => (d == null ? "" : compact ? DAY_NAMES[d].slice(0, 3) : DAY_NAMES[d])}
        selectedItem={depart.day}
        onChange={({ selectedItem }: { selectedItem: number | null }) => {
          if (selectedItem != null) setDepart({ ...depart, day: selectedItem });
        }}
      />
      <Dropdown
        id={`${id}-time`}
        type="inline"
        size="sm"
        titleText="Time"
        hideLabel
        label="Time"
        items={TIMES}
        itemToString={(m: number | null) => (m == null ? "" : clockLabel(m))}
        selectedItem={depart.minutes}
        onChange={({ selectedItem }: { selectedItem: number | null }) => {
          if (selectedItem != null) setDepart({ ...depart, minutes: selectedItem });
        }}
      />
    </div>
  );
}
