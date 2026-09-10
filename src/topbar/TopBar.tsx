// Thin top bar: wordmark and nav pills on the left, search in the center, county
// selector and help on the right. Search accepts school name, MSID, county, or
// board district number. No marketing copy anywhere.

import { useEffect, useRef, useState } from "react";
import { useData } from "../data/DataContext";
import { useStore, type LatLng } from "../store";
import { panMapTo } from "../map/mapController";
import { REGIONS } from "../config/layers";
import { Icon } from "../ui/icons";

const COUNTY_VIEW: Record<string, { center: LatLng; zoom: number }> = {
  "Miami-Dade": { center: { lat: 25.72, lng: -80.3 }, zoom: 10 },
  Broward: { center: { lat: 26.19, lng: -80.2 }, zoom: 10 },
  Orange: { center: { lat: 28.5, lng: -81.37 }, zoom: 10 },
  All: { center: { lat: 27.0, lng: -80.9 }, zoom: 7 },
};

export function TopBar({ onToggleAttribution }: { onToggleAttribution: () => void }) {
  const { schools } = useData();
  const selectSchool = useStore((s) => s.selectSchool);
  const setMapView = useStore((s) => s.setMapView);
  const [query, setQuery] = useState("");
  const [county, setCounty] = useState("All");
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut: / or Cmd/Ctrl+K focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        if (document.activeElement === inputRef.current) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setNotFound(false);
    const q = query.trim().toLowerCase();
    if (!q || !schools) return;
    const match = schools.features.find(
      (f) => f.properties.name.toLowerCase().includes(q) || f.properties.msid.toLowerCase() === q,
    );
    if (match) {
      const [lng, lat] = match.geometry.coordinates as [number, number];
      selectSchool(match.properties.msid);
      setMapView({ lat, lng }, 16);
      panMapTo({ lat, lng }, 16);
    } else {
      setNotFound(true);
    }
  };

  const onCounty = (c: string) => {
    setCounty(c);
    const view = COUNTY_VIEW[c];
    if (view) {
      setMapView(view.center, view.zoom);
      panMapTo(view.center, view.zoom);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="wordmark">Florida Facilities Tool</span>
        <span className="sample-badge" title="This build runs on committed sample data, not live sources.">
          Sample data
        </span>
      </div>

      <form className="search" onSubmit={runSearch} role="search">
        <Icon.Search size={16} className="search-icon" />
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          placeholder="Search school name, MSID, county"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotFound(false);
          }}
          aria-label="Search schools"
        />
        <kbd className="search-kbd">/</kbd>
        {notFound && <span className="search-notfound">No match</span>}
      </form>

      <div className="topbar-right">
        <label className="county-select">
          <span className="visually-hidden">County</span>
          <select value={county} onChange={(e) => onCounty(e.target.value)} aria-label="County selector">
            <option value="All">All counties</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-btn" aria-label="Attributions and help" title="Attributions" onClick={onToggleAttribution}>
          <Icon.Help size={18} />
        </button>
      </div>
    </header>
  );
}
