// The account / help menu, extracted so it can live in TWO places: the phone app
// bar (where there is no persistent rail) and, on desktop, the bottom of the left
// rail beside Reset (which declutters the app bar, per the brief). It owns its own
// open state and popover; only the attribution-sheet trigger is lifted out via
// onOpenAttribution so the same sheet opens from either mount. Real Carbon
// Popover, KIPP-navy avatar. No em dashes in this file.

import { useState } from "react";
import { Popover, PopoverContent } from "@carbon/react";
import { Information as InfoOutlinedIcon, Keyboard as KeyboardIcon } from "@carbon/icons-react";

export function AccountMenu({
  variant = "header",
  onOpenAttribution,
}: {
  // "header" is the round avatar disc in the app bar; "rail" is a stacked
  // icon-over-label button matching the left rail's other items.
  variant?: "header" | "rail";
  onOpenAttribution: () => void;
}) {
  const [open, setOpen] = useState(false);
  // From the rail (bottom-left) the menu opens up-and-right so it never runs off
  // the left screen edge; from the header it drops down-left as before.
  const align = variant === "rail" ? "right-bottom" : "bottom-right";

  return (
    <Popover open={open} onRequestClose={() => setOpen(false)} align={align} dropShadow>
      {variant === "rail" ? (
        <button
          type="button"
          className={`rail-account${open ? " rail-account--on" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="Account, data sources, and help"
          aria-expanded={open}
        >
          <span className="rail-account__avatar" aria-hidden>A</span>
          <span className="rail-account__label">Account</span>
        </button>
      ) : (
        <button
          type="button"
          className="app-header__avatar"
          onClick={() => setOpen((v) => !v)}
          aria-label="Account, data sources, and help"
          aria-expanded={open}
        >
          A
        </button>
      )}
      <PopoverContent>
        <div className="hdr-menu">
          <div className="hdr-menu__account">
            <span className="hdr-menu__account-avatar" aria-hidden>A</span>
            <span className="hdr-menu__email">avery.aden1@gmail.com</span>
          </div>
          <div className="hdr-menu__divider" />
          <div className="hdr-menu__status">
            <span className="hdr-menu__status-dot" aria-hidden />
            <span>
              <span className="hdr-menu__primary">Live data, NCES CCD</span>
              <span className="hdr-menu__secondary">
                Enrollment through 2024-2025. Letter grades from Florida DOE; building
                capacity from FISH student stations.
              </span>
            </span>
          </div>
          <div className="hdr-menu__divider" />
          <button className="hdr-menu__item" onClick={() => { setOpen(false); onOpenAttribution(); }}>
            <InfoOutlinedIcon size={16} />
            <span>
              <span className="hdr-menu__primary">Data sources &amp; accuracy</span>
              <span className="hdr-menu__secondary">Every field: source, vintage, confidence</span>
            </span>
          </button>
          <div className="hdr-menu__item hdr-menu__item--static">
            <KeyboardIcon size={16} />
            <span>
              <span className="hdr-menu__primary">Keyboard shortcuts</span>
              <span className="hdr-menu__secondary">
                <span className="mono">/</span> to search, <span className="mono">Esc</span> to close inspector
              </span>
            </span>
          </div>
          <div className="hdr-menu__divider" />
          <div className="hdr-menu__about">
            <span className="hdr-menu__primary">About</span>
            <span className="hdr-menu__secondary">
              Florida Facilities Tool maps Florida's Schools of Hope eligibility rule
              (F.S. 1002.333) across Miami-Dade, Broward, and Orange counties.
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
