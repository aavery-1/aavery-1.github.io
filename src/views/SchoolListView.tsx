// Full-screen List view: the analytical surface. Honors the same filters as the
// map (county, grade, utilization) so both views always show the same universe.
// A scope control chooses between every filtered school and only those in the
// current map bounds, the set the map's "schools in view" dock hands off. Clicking
// a row opens the inspector; the per-row "Show on map" action jumps back to the
// map. The table itself lives in SchoolTable, shared with the map dock's data.

import { ContentSwitcher, Switch } from "@carbon/react";
import { useStore, type ListScope } from "../store";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { SchoolTable } from "./SchoolTable";
import "./SchoolListView.carbon.css";

const SCOPE_ORDER: ListScope[] = ["all", "inView"];

export function SchoolListView() {
  const listScope = useStore((s) => s.listScope);
  const setListScope = useStore((s) => s.setListScope);
  const { total, inViewTotal } = useFilteredSchools();

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
                All schools
                <Count value={total} active={listScope === "all"} />
              </span>
            </Switch>
            <Switch name="inView" aria-label="Schools in the current map view">
              <span className="school-list__scope-inner">
                In map view
                <Count value={inViewTotal} active={listScope === "inView"} />
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

function Count({ value, active }: { value: number; active: boolean }) {
  return (
    <span className="school-list__scope-count" style={active ? { color: "#0043CE" } : undefined}>
      {value.toLocaleString("en-US")}
    </span>
  );
}
