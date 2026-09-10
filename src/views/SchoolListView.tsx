// Full-screen List view: the analytical surface. Honors the same filters as the
// map (county, grade, utilization) so both views always show the same universe.
// A scope control chooses between every filtered school and only those in the
// current map bounds, the set the map's "schools in view" dock hands off. Clicking
// a row opens the inspector; the per-row "Show on map" action jumps back to the
// map. The table itself lives in SchoolTable, shared with the map dock's data.

import { ContentSwitcher, Switch } from "@carbon/react";
import { useStore, type ListScope } from "../store";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { usePhone } from "../ui/useMediaQuery";
import { SchoolTable } from "./SchoolTable";
import "./SchoolListView.carbon.css";

const SCOPE_ORDER: ListScope[] = ["all", "inView"];

export function SchoolListView() {
  const listScope = useStore((s) => s.listScope);
  const setListScope = useStore((s) => s.setListScope);
  const { total, inViewTotal } = useFilteredSchools();
  // On a phone the full segment labels plus their counts overflow the switcher
  // (the count clipped to "1,15"); shorten the labels there so both counts read.
  const phone = usePhone();

  const selectedIndex = Math.max(0, SCOPE_ORDER.indexOf(listScope));

  return (
    <div className="school-list">
      {/* Scope bar: which set of schools the table shows. Distinct from the
          table's own search, which narrows within the chosen set. */}
      <div className="school-list__scope-bar">
        <span className="school-list__scope-label">Show</span>
        <div className="school-list__scope-switch">
          <ContentSwitcher
            selectedIndex={selectedIndex}
            onChange={({ name }) => { if (name) setListScope(name as ListScope); }}
            size="sm"
            aria-label="School scope"
          >
            <Switch name="all" aria-label="All filtered schools">
              <span className="school-list__scope-inner">
                {phone ? "All" : "All schools"}
                <Count value={total} />
              </span>
            </Switch>
            <Switch name="inView" aria-label="Schools in the current map view">
              <span className="school-list__scope-inner">
                {phone ? "In view" : "In map view"}
                <Count value={inViewTotal} />
              </span>
            </Switch>
          </ContentSwitcher>
        </div>
        {listScope === "inView" && (
          <span className="school-list__scope-note">
            Limited to the area last shown on the map. Switch to Map view to pan or zoom.
          </span>
        )}
      </div>
      <div className="school-list__table">
        <SchoolTable scope={listScope} />
      </div>
    </div>
  );
}

// The count's color is handled entirely in CSS so it stays legible on BOTH the
// selected (dark) and unselected (light) segments: brand light-blue on dark,
// text-primary on light. Inline color here forced a dark blue onto the dark
// selected segment (failed contrast).
function Count({ value }: { value: number }) {
  return <span className="school-list__scope-count">{value.toLocaleString("en-US")}</span>;
}
