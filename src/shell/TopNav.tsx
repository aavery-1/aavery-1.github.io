// Product app bar, built on IBM Carbon components. Owns the identity, the view
// switcher (Carbon ContentSwitcher), the school search (Carbon ComboBox), an info
// menu (Carbon Popover), and the user avatar. Responsive: on narrow screens the
// wordmark tagline hides and the search collapses to an icon that opens the same
// ComboBox in a Popover; on mobile a menu button opens the filters drawer.
//
// This is real Carbon: no MUI, no sx. Chrome colors come from Carbon's g10 theme
// tokens (--cds-*). The search caps its own result list (top matches only) so it
// stays fast over the full ~1,100-school directory, the way the old Autocomplete
// did. No em dashes in this file.

import { useEffect, useRef, useState, useMemo } from "react";
import { ComboBox, ContentSwitcher, Switch, IconButton, Tag, Tooltip, Popover, PopoverContent } from "@carbon/react";
import { Education as HubIcon, Search as SearchIcon, Map as MapIcon, List as ViewListIcon, Compare as CompareIcon, Information as InfoOutlinedIcon, Help as HelpOutlineIcon, Keyboard as KeyboardIcon, Menu as MenuIcon } from "@carbon/icons-react";
import { useData } from "../data/DataContext";
import { useStore, type ViewMode } from "../store";
import { panMapTo } from "../map/mapController";
import { useCompact, usePhone } from "../ui/useMediaQuery";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import type { SchoolFeature } from "../data/types";

const VIEW_ORDER: ViewMode[] = ["map", "list", "compare"];

// Rank school options for the search: exact-ish name/MSID matches, capped so the
// ComboBox never renders the whole directory at once (the old Autocomplete cap).
function filterSchools(all: SchoolFeature[], raw: string): SchoolFeature[] {
  const q = raw.trim().toLowerCase();
  if (!q) return all.slice(0, 12);
  return all
    .filter((o) => o.properties.name.toLowerCase().includes(q) || o.properties.msid.toLowerCase().includes(q))
    .slice(0, 24);
}

export function TopNav({
  onOpenAttribution,
  onOpenMobileRail,
}: {
  onOpenAttribution: () => void;
  onOpenMobileRail?: () => void;
}) {
  // One consistent phone breakpoint with App (< 600): below it the filters move
  // into a drawer opened from the hamburger. compactSearch (< 900) is separate:
  // the wide search field would overflow the bar on tablets, so it collapses to an
  // icon that opens the same ComboBox in a popover.
  const isPhone = usePhone();
  const compactSearch = useCompact();
  const { schools } = useData();
  const selectSchool = useStore((s) => s.selectSchool);
  const setMapView = useStore((s) => s.setMapView);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const compareCount = useStore((s) => s.comparePinnedMsids.length);
  const setCollapsed = useStore((s) => s.setPanelCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchPopoverOpen, setSearchPopoverOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        if (document.activeElement === inputRef.current) return;
        e.preventDefault();
        if (compactSearch) setSearchPopoverOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compactSearch]);

  const allOptions: SchoolFeature[] = useMemo(() => schools?.features ?? [], [schools]);
  const items = useMemo(() => filterSchools(allOptions, searchInput), [allOptions, searchInput]);

  const goToSchool = (f: SchoolFeature | null | undefined) => {
    if (!f) return;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    if (viewMode !== "map") setViewMode("map");
    selectSchool(f.properties.msid);
    setMapView({ lat, lng }, 16);
    panMapTo({ lat, lng }, 16);
    setSearchInput("");
    setSearchPopoverOpen(false);
    inputRef.current?.blur();
  };

  const openMobileRail = () => {
    setCollapsed(false);
    onOpenMobileRail?.();
  };

  // The Carbon ComboBox search, placed either inline in the bar (md+) or inside a
  // Popover opened from a search icon (below md). shouldFilterItem returns true
  // because `items` is already the filtered, capped set from our own input state.
  const searchCombo = (
    <ComboBox<SchoolFeature>
      id="school-search"
      className="app-header__search"
      aria-label="Search school or MSID"
      placeholder="Search school or MSID"
      items={items}
      selectedItem={null}
      shouldFilterItem={() => true}
      onInputChange={(v) => setSearchInput(v ?? "")}
      onChange={({ selectedItem }) => goToSchool(selectedItem)}
      itemToString={(item) => (item ? item.properties.name : "")}
      itemToElement={(item) => {
        if (!item) return <span />;
        const gs = resolveGradeStyle(item.properties.current_grade);
        return (
          <span className="school-option">
            <span
              className="school-option__grade"
              style={{
                background: rgbaToCss(gs.fill),
                color: rgbaToCss(gs.letterColor),
                border: `1.25px ${gs.dashed ? "dashed" : "solid"} ${rgbaToCss(gs.stroke)}`,
              }}
            >
              {gs.letter}
            </span>
            <span className="school-option__text">
              <span className="school-option__name">{item.properties.name}</span>
              <span className="school-option__sub">
                {item.properties.county}, {item.properties.level}, <span className="mono">{item.properties.msid}</span>
              </span>
            </span>
          </span>
        );
      }}
      ref={inputRef}
    />
  );

  const selectedIndex = Math.max(0, VIEW_ORDER.indexOf(viewMode));

  return (
    <header className="app-header">
      {isPhone && (
        <IconButton label="Open filters" kind="ghost" size="md" align="bottom-left" onClick={openMobileRail}>
          <MenuIcon size={20} />
        </IconButton>
      )}

      {/* Product identity */}
      <div className="app-header__brand">
        <span className="app-header__logo" aria-hidden>
          <HubIcon size={18} />
        </span>
        {!isPhone && (
          <span className="app-header__id">
            <span className="app-header__title">Hope Siting</span>
            <span className="app-header__subtitle">Schools of Hope, Florida</span>
          </span>
        )}
      </div>

      <Tooltip
        label="School directory from NCES CCD (Common Core of Data), enrollment through 2024-2025. Letter grades wired from Florida DOE; building capacity from FISH (student stations)."
        align="bottom"
      >
        <span className="app-header__source-tag">
          <Tag type="cool-gray" size="sm">Live, NCES CCD</Tag>
        </span>
      </Tooltip>

      <div className="app-header__spacer" />

      {/* View switcher */}
      <div className="app-header__switch">
        <ContentSwitcher
          selectedIndex={selectedIndex}
          onChange={({ name }) => name && setViewMode(name as ViewMode)}
          size="md"
        >
          <Switch name="map">
            <span className="view-switch__inner"><MapIcon size={16} /><span className="view-switch__label">Map</span></span>
          </Switch>
          <Switch name="list">
            <span className="view-switch__inner"><ViewListIcon size={16} /><span className="view-switch__label">List</span></span>
          </Switch>
          <Switch name="compare">
            <span className="view-switch__inner">
              <CompareIcon size={16} />
              <span className="view-switch__label">Compare</span>
              {compareCount > 0 && <span className="view-switch__badge">{compareCount}</span>}
            </span>
          </Switch>
        </ContentSwitcher>
      </div>

      {/* Search: full field on wide screens; below md it collapses to an icon that
          opens the same ComboBox in a popover, so the bar never overflows. */}
      {compactSearch ? (
        <Popover open={searchPopoverOpen} onRequestClose={() => setSearchPopoverOpen(false)} align="bottom-right" dropShadow highContrast={false}>
          <IconButton label="Search school or MSID" kind="ghost" size="md" onClick={() => setSearchPopoverOpen((v) => !v)}>
            <SearchIcon size={18} />
          </IconButton>
          <PopoverContent>
            <div className="app-header__search-popover">{searchCombo}</div>
          </PopoverContent>
        </Popover>
      ) : (
        searchCombo
      )}

      {!isPhone && (
        <Popover open={menuOpen} onRequestClose={() => setMenuOpen(false)} align="bottom-right" dropShadow>
          <IconButton label="Info and attributions" kind="ghost" size="md" onClick={() => setMenuOpen((v) => !v)}>
            <HelpOutlineIcon size={16} />
          </IconButton>
          <PopoverContent>
            <div className="hdr-menu">
              <button className="hdr-menu__item" onClick={() => { setMenuOpen(false); onOpenAttribution(); }}>
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
                  Hope Siting maps Florida's Schools of Hope eligibility rule
                  (F.S. 1002.333) across Miami-Dade, Broward, and Orange counties.
                </span>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Tooltip label="avery.aden1@gmail.com" align="bottom-right">
        <span className="app-header__avatar" aria-hidden>A</span>
      </Tooltip>
    </header>
  );
}
