// Phone-only quick actions ON THE MAP: Search and Filters, pulled off the app bar
// so the phone bar stays uncrowded (brand + view switch + shortlist + account).
// They sit as a white control cluster at the top-left of the map, matching the
// other map chrome (legend / base map), where dark icons read fine on white. The
// Filters button opens the same filters drawer the rest of the tool uses and
// carries a badge with the active-filter count; Search opens the shared
// SchoolSearch in a popover. No em dashes in this file.

import { useState } from "react";
import { Popover, PopoverContent } from "@carbon/react";
import { Filter as FilterIcon, Search as SearchIcon } from "@carbon/icons-react";
import { useStore } from "../store";
import { usePhone } from "../ui/useMediaQuery";
import { useActiveFilters } from "../status/useActiveFilters";
import { SchoolSearch } from "../shell/SchoolSearch";
import "./MapQuickActions.css";

export function MapQuickActions() {
  const isPhone = usePhone();
  const setMobileRailOpen = useStore((s) => s.setMobileRailOpen);
  const activeCount = useActiveFilters().length;
  const [searchOpen, setSearchOpen] = useState(false);

  if (!isPhone) return null;

  return (
    <div className="map-quick-actions">
      <button
        type="button"
        className="map-quick-actions__btn"
        onClick={() => setMobileRailOpen(true)}
        aria-label={activeCount > 0 ? `Filters, ${activeCount} active` : "Filters"}
      >
        <FilterIcon size={18} />
        <span className="map-quick-actions__label">Filters</span>
        {activeCount > 0 && <span className="map-quick-actions__badge">{activeCount}</span>}
      </button>

      <span className="map-quick-actions__sep" aria-hidden />

      <Popover open={searchOpen} onRequestClose={() => setSearchOpen(false)} align="bottom-left" dropShadow>
        <button
          type="button"
          className="map-quick-actions__btn"
          onClick={() => setSearchOpen((v) => !v)}
          aria-label="Search schools"
        >
          <SearchIcon size={18} />
          <span className="map-quick-actions__label">Search</span>
        </button>
        <PopoverContent>
          <div className="map-quick-actions__search">
            <SchoolSearch autoFocus placeholder="Search school or MSID" onSelected={() => setSearchOpen(false)} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
