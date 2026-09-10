// Active-filter breadcrumb strip that hovers at the top of the map. Renders only
// non-default filters, each as a chip with an x that clears just that filter.
// When nothing is filtered the strip renders nothing. Reads the shared
// useActiveFilters() list (same source the panel's applied-filters summary uses),
// so the two always mirror the real filter state. Real Carbon: DismissibleTag
// chips in a floating card. No em dashes in this file.

import { DismissibleTag } from "@carbon/react";
import { useStore } from "../store";
import { useActiveFilters } from "./useActiveFilters";
import "./ActiveFilterChips.carbon.css";

export function ActiveFilterChips() {
  const filters = useActiveFilters();
  const clearAllFilters = useStore((s) => s.clearAllFilters);

  if (filters.length === 0) return null;

  return (
    <div role="status" aria-label="Active filters" className="active-filter-chips">
      <span className="active-filter-chips__label">Active</span>
      <div className="active-filter-chips__list">
        {filters.map((f) => (
          <DismissibleTag
            key={f.key}
            size="md"
            text={f.label}
            onClose={f.onClear}
            className={`active-filter-chips__tag active-filter-chips__tag--${f.section === "Geography" ? "geo" : "schools"}`}
          />
        ))}
      </div>
      {filters.length > 1 && (
        <>
          <hr className="active-filter-chips__divider" />
          <button className="active-filter-chips__clear" onClick={clearAllFilters}>
            Clear all
          </button>
        </>
      )}
    </div>
  );
}
