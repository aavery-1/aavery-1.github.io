// The school search, extracted so both the app bar (persistent field / compact
// popover) and the map's quick-actions button can share ONE implementation. It is
// a Carbon ComboBox over the full ~1,100-school directory, capped to the top
// matches so it never renders the whole list at once, and selecting a result flies
// the map to that school and opens its inspector. No em dashes in this file.

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ComboBox } from "@carbon/react";
import { useData } from "../data/DataContext";
import { useStore } from "../store";
import { panMapTo } from "../map/mapController";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import type { SchoolFeature } from "../data/types";

// Rank school options so the closest matches come first. A plain substring test
// is not enough: "orlan" is inside "N(orlan)d" as well as "Orlando", so an
// includes() sort surfaced Norland above Orlando. We score by WHERE the query
// lands (exact id, then start-of-name, then start-of-any-word, then MSID, then a
// bare interior substring), so a name/word prefix always beats an interior hit.
// Capped so the ComboBox never renders the whole directory at once.
function matchScore(f: SchoolFeature, q: string): number {
  const name = f.properties.name.toLowerCase();
  const msid = f.properties.msid.toLowerCase();
  if (msid === q) return 100;                       // exact MSID
  if (name === q) return 95;                        // exact name
  if (name.startsWith(q)) return 80;                // name prefix (Orlando for "orlan")
  // Start of any word in the name (e.g. "science" in "Orlando Science"). A word
  // boundary is a space or common separator; this is what makes the match feel
  // like a real name search rather than a raw substring scan.
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name)) return 65;
  if (msid.startsWith(q)) return 50;                // MSID prefix
  if (name.includes(q)) return 30;                  // interior substring (Norland for "orlan")
  if (msid.includes(q)) return 20;                  // interior MSID substring
  return -1;                                        // no match
}

function filterSchools(all: SchoolFeature[], raw: string): SchoolFeature[] {
  const q = raw.trim().toLowerCase();
  // The dropdown stays closed until the analyst types: an empty query yields no
  // options, and the empty menu is hidden in CSS (see styles.css). This avoids a
  // full, distracting directory list on focus.
  if (!q) return [];
  return all
    .map((f) => ({ f, score: matchScore(f, q) }))
    .filter((m) => m.score >= 0)
    // Higher score first; ties broken by shorter (closer) name, then alphabetically.
    .sort((a, b) =>
      b.score - a.score ||
      a.f.properties.name.length - b.f.properties.name.length ||
      a.f.properties.name.localeCompare(b.f.properties.name),
    )
    .slice(0, 24)
    .map((m) => m.f);
}

export function SchoolSearch({
  id = "school-search",
  className = "app-header__search",
  placeholder = "Search school or MSID",
  autoFocus = false,
  onSelected,
  inputRef: externalRef,
}: {
  id?: string;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSelected?: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const { schools } = useData();
  const selectSchool = useStore((s) => s.selectSchool);
  const setMapView = useStore((s) => s.setMapView);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const [searchInput, setSearchInput] = useState("");
  const localRef = useRef<HTMLInputElement | null>(null);
  const inputRef = externalRef ?? localRef;

  const allOptions: SchoolFeature[] = useMemo(() => schools?.features ?? [], [schools]);
  const items = useMemo(() => filterSchools(allOptions, searchInput), [allOptions, searchInput]);

  useEffect(() => {
    if (autoFocus) {
      // Focus after the popover has mounted the input.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [autoFocus, inputRef]);

  const goToSchool = (f: SchoolFeature | null | undefined) => {
    if (!f) return;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    if (viewMode !== "map") setViewMode("map");
    selectSchool(f.properties.msid);
    setMapView({ lat, lng }, 16);
    panMapTo({ lat, lng }, 16);
    setSearchInput("");
    inputRef.current?.blur();
    onSelected?.();
  };

  return (
    <ComboBox<SchoolFeature>
      id={id}
      className={className}
      aria-label={placeholder}
      placeholder={placeholder}
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
      ref={inputRef as RefObject<HTMLInputElement>}
    />
  );
}
