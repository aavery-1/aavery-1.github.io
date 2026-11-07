// One applied-filter chip (a Carbon DismissibleTag), shared by the filter panel's
// applied-filters summary and the List view's filter row so the two read the
// same. Geography filters wear the purple accent, school filters the navy one.
// Styles in FilterChip.carbon.css. No em dashes in this file.

import { DismissibleTag } from "@carbon/react";
import "./FilterChip.carbon.css";

export function FilterChip({ label, onClear, geography = false }: { label: string; onClear: () => void; geography?: boolean }) {
  return (
    <DismissibleTag
      size="sm"
      text={label}
      title={label}
      dismissTooltipLabel={`Remove filter: ${label}`}
      onClose={onClear}
      className={`filter-chip${geography ? " filter-chip--geo" : ""}`}
    />
  );
}
