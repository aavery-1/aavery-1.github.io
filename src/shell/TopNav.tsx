// Product app bar, built on IBM Carbon components. Owns the identity, the primary
// view switcher (Carbon ContentSwitcher), the school search (shared SchoolSearch),
// and one consolidated account menu (Carbon Popover).
//
// Layout follows IBM Carbon's own UI-shell rule: left to right runs product to
// global, in three zones:
//   - LEFT (product): brand identity, then the Map/List switcher as the tool's
//     primary navigation, grouped with the brand behind a hairline divider.
//   - MIDDLE (system): a persistent search field that fills the bar (md+), the
//     primary "find a school" action.
//   - RIGHT (global): the shortlist "cart" and the account menu.
// Responsive: on tablet the middle search collapses to an icon + Popover; on phone
// the search AND the filters move OFF the bar onto the map (see MapQuickActions),
// so the phone bar stays to brand + view switch + shortlist + account.
//
// The bar is 56px tall with generous, 8px-grid spacing so it reads as part of the
// same airy system as the rest of the tool, not a dense strip. Real Carbon: no
// MUI, no sx. No em dashes in this file.

import { useEffect, useRef, useState } from "react";
import { ContentSwitcher, Switch, IconButton, Popover, PopoverContent } from "@carbon/react";
import { Search as SearchIcon, Map as MapIcon, List as ViewListIcon } from "@carbon/icons-react";
import { useStore, type ViewMode } from "../store";
import { usePhone, useCompact } from "../ui/useMediaQuery";
import { SchoolSearch } from "./SchoolSearch";
import { AccountMenu } from "./AccountMenu";

const VIEW_ORDER: ViewMode[] = ["map", "list"];

export function TopNav({ onOpenAttribution }: { onOpenAttribution: () => void }) {
  // Phone (< 600): search + filters live on the map, not the bar. Tablet (< 900):
  // the wide search field would overflow, so it collapses to an icon + popover.
  const isPhone = usePhone();
  const isCompact = useCompact();
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // "/" or Cmd/Ctrl-K jumps to search. On desktop it focuses the persistent field;
  // on tablet it opens the search popover. (Phone search lives on the map.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        if (isPhone) return;
        if (document.activeElement === inputRef.current) return;
        e.preventDefault();
        if (isCompact) setSearchPopoverOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPhone, isCompact]);

  const selectedIndex = Math.max(0, VIEW_ORDER.indexOf(viewMode));

  return (
    <header className="app-header">
      {/* LEFT ZONE (product): identity + the primary Map/List navigation. */}
      <div className="app-header__lead">
        <div className="app-header__brand">
          <span className="app-header__logo">
            {/* Full wordmark on desktop; the compact "KIPP:" mark on tablet/phone,
                where the 13:1 wordmark would crowd out the controls and account. */}
            <img className="app-header__logo-full" src="/kipp-team-family.jpg" alt="KIPP Team and Family" />
            <img className="app-header__logo-mark" src="/kipp-mark.jpg" alt="KIPP Team and Family" aria-hidden="true" />
          </span>
        </div>
      </div>

      {/* MIDDLE ZONE (system): persistent search on md+. */}
      <div className="app-header__mid">
        {!isCompact && (
          <div className="app-header__search-wrap">
            <SchoolSearch inputRef={inputRef} />
          </div>
        )}
      </div>

      {/* RIGHT ZONE: the Map/List switcher sits just right of the search, then the
          shortlist cart and the account menu. */}
      <div className="app-header__utils">
        {/* Tablet only: the search collapses to an icon + popover. On phone it is
            on the map instead. Kept before the switcher so the switcher still reads
            as sitting to the right of the search at every width. */}
        {isCompact && !isPhone && (
          <Popover open={searchPopoverOpen} onRequestClose={() => setSearchPopoverOpen(false)} align="bottom-right" dropShadow highContrast={false}>
            <IconButton label="Search school or MSID" kind="ghost" size="lg" onClick={() => setSearchPopoverOpen((v) => !v)}>
              <SearchIcon size={20} />
            </IconButton>
            <PopoverContent>
              <div className="app-header__search-popover">
                <SchoolSearch autoFocus onSelected={() => setSearchPopoverOpen(false)} />
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div className="app-header__switch">
          <ContentSwitcher
            selectedIndex={selectedIndex}
            onChange={({ name }) => name && setViewMode(name as ViewMode)}
            size="lg"
          >
            <Switch name="map">
              <span className="view-switch__inner"><MapIcon size={16} /><span className="view-switch__label">Map</span></span>
            </Switch>
            <Switch name="list">
              <span className="view-switch__inner"><ViewListIcon size={16} /><span className="view-switch__label">List</span></span>
            </Switch>
          </ContentSwitcher>
        </div>

        {/* Account is a low-frequency, global-utility action, so on desktop it
            moves OFF the bar to the bottom-left rail (beside Reset) to give the
            brand and the primary controls room. On phone there is no persistent
            rail, so it stays here. */}
        {isPhone && (
          <>
            <span className="app-header__util-sep" aria-hidden />
            <AccountMenu variant="header" onOpenAttribution={onOpenAttribution} />
          </>
        )}
      </div>
    </header>
  );
}
