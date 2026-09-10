// The shortlist tray: the map's "which of these few" surface, replacing the old
// full-screen Compare view. A scouting operator lives on the map, so the pinned
// sites (2 to 4) ride the map as a collapsible bottom tray of compact candidate
// cards, each leading with the go/no-go an operator asks first: is this site
// even eligible, which PLP school would it serve and how far, is there room, is
// it Title I. The full row-by-row matrix is one click away ("Full table") for
// the moment an analyst wants every field, so nothing built for Compare is lost.
//
// The tray only exists on the map (App renders it inside the map block) and only
// when open with at least one pinned site. Every value reads the SAME derived
// context (useFilteredSchools ctx) the map, list, dock, and inspector use, so the
// tray can never disagree with them. No em dashes in this file.

import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton, Tag } from "@carbon/react";
import { ChevronDown, Close as CloseIcon, Bookmark as BookmarkIcon, Table as TableIcon, ZoomFit as FitIcon, TrashCan as TrashIcon } from "@carbon/icons-react";
import { useData } from "../data/DataContext";
import { useMediaQuery, usePhone } from "../ui/useMediaQuery";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { useStore, utilizationStyle, MAX_COMPARE } from "../store";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { fitMapToBounds } from "../map/mapController";
import { titleILabel } from "../data/types";
import { ExportButton } from "../tools/ExportButton";
import { buildCompareSections } from "../views/compareModel";
import type { SchoolFeature } from "../data/types";
import type { SchoolFilterContext } from "../data/derive/filters";
import type { LatLng } from "../store";
import "./ShortlistTray.carbon.css";

// The full comparison matrix is only pulled in when the operator opens it, so it
// stays out of the tray's own chunk.
const CompareView = lazy(() => import("../views/CompareView").then((m) => ({ default: m.CompareView })));

// The one spatial fact that matters most for siting: which PLP anchor this site
// would serve, and how far. A PLP school is itself the anchor; a co-location
// candidate carries the nearest same-county anchor within 5 miles; a site that
// is siting-eligible another way (an Opportunity Zone) says so; anything else has
// no qualifying anchor.
function anchorLine(msid: string, ctx: SchoolFilterContext): { text: string; muted?: boolean } {
  if (ctx.plp.has(msid)) return { text: "Is the PLP anchor" };
  const near = ctx.coLocationReasons.get(msid)?.nearestPlp;
  if (near) return { text: `Serves ${near.name} · ${near.miles.toFixed(1)} mi` };
  if (ctx.sohEligibleMsids.has(msid)) return { text: "In a siting area" };
  return { text: "No PLP anchor within 5 mi", muted: true };
}

export function ShortlistTray() {
  const data = useData();
  const { ctx } = useFilteredSchools();
  const comparePinnedMsids = useStore((s) => s.comparePinnedMsids);
  const shortlistOpen = useStore((s) => s.shortlistOpen);
  const setShortlistOpen = useStore((s) => s.setShortlistOpen);
  const toggleComparePin = useStore((s) => s.toggleComparePin);
  const clearCompare = useStore((s) => s.clearCompare);
  const selectSchool = useStore((s) => s.selectSchool);
  const selectedMsid = useStore((s) => s.selectedSchoolMsid);
  const setFullTableOpen = useStore((s) => s.setShortlistFullTableOpen);
  // On a phone the labelled action buttons wrap into a messy multi-row stack, so
  // there they collapse to a single row of icon-only controls (labels survive as
  // tooltips / accessible names).
  const phone = usePhone();

  const schools = useMemo(
    () =>
      comparePinnedMsids
        .map((msid) => data.schools?.features.find((f) => f.properties.msid === msid))
        .filter((f): f is SchoolFeature => Boolean(f)),
    [comparePinnedMsids, data.schools],
  );

  // Export the flat matrix (same content as the full table) straight from the
  // tray, so a shortlist can be handed off without opening the table first.
  const { headers, exportRows } = useMemo(() => {
    const sections = buildCompareSections(schools, ctx, data);
    const flat = sections.flatMap((sec) => sec.rows);
    return {
      headers: ["Field", ...schools.map((s) => s.properties.name)],
      exportRows: [
        ["MSID", ...schools.map((s) => s.properties.msid)],
        ...flat.map((r) => [r.label, ...r.values]),
      ] as Array<Array<unknown>>,
    };
  }, [schools, ctx, data]);

  // Smooth expand/collapse: the tray stays mounted through its slide-DOWN so the
  // collapse animates (an unmount-on-close was choppy). `mounted` goes true when
  // opened; while closing (shortlistOpen false but still mounted) the root carries
  // `--closing` for the slide-down keyframe and unmounts on animationend.
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [mounted, setMounted] = useState(shortlistOpen);
  useEffect(() => {
    if (shortlistOpen) { setMounted(true); return; }
    // Closing: with motion, onAnimationEnd unmounts after the slide-down; keep a
    // safety timeout in case that event is missed. With reduced motion there is no
    // animation, so unmount at once.
    if (reduceMotion) { setMounted(false); return; }
    const t = setTimeout(() => setMounted(false), 400);
    return () => clearTimeout(t);
  }, [shortlistOpen, reduceMotion]);
  if (!mounted) return null;
  const closing = !shortlistOpen;
  const closingClass = closing ? " shortlist-tray--closing" : "";

  // Empty state: the shortlist opener is always present (the "cart" pattern), so
  // opening it with nothing pinned lands here rather than on a blank tray. It
  // tells the operator how to fill it and offers a one-tap way out.
  if (schools.length === 0) {
    return (
      <div
        className={`shortlist-tray shortlist-tray--empty${closingClass}`}
        role="region"
        aria-label="Shortlist of pinned sites"
        aria-hidden={closing || undefined}
        onAnimationEnd={(e) => { if (e.target === e.currentTarget && closing) setMounted(false); }}
      >
        <div className="shortlist-tray__bar">
          <div className="shortlist-tray__title">
            <BookmarkIcon size={16} />
            <span className="shortlist-tray__title-text">Shortlist</span>
            <span className="shortlist-tray__count">0 of {MAX_COMPARE}</span>
          </div>
          <div className="shortlist-tray__actions">
            <IconButton kind="ghost" size="sm" label="Collapse shortlist" align="bottom-right" onClick={() => setShortlistOpen(false)}>
              <ChevronDown size={16} />
            </IconButton>
          </div>
        </div>
        <div className="shortlist-tray__empty">
          Pin up to {MAX_COMPARE} sites from the map or list to compare them side by side.
        </div>
      </div>
    );
  }

  const fitToShortlist = () => {
    const pts: LatLng[] = schools.map((s) => {
      const [lng, lat] = s.geometry.coordinates as [number, number];
      return { lat, lng };
    });
    fitMapToBounds(pts);
  };

  // When a school is selected the inspector floats over the map's right edge; the
  // tray insets its right side so the two sit side by side instead of overlapping.
  const inspectorOpen = Boolean(selectedMsid);

  return (
    <div
      className={`shortlist-tray${inspectorOpen ? " shortlist-tray--inspector" : ""}${closingClass}`}
      role="region"
      aria-label="Shortlist of pinned sites"
      aria-hidden={closing || undefined}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && closing) setMounted(false); }}
    >
      <div className="shortlist-tray__bar">
        <div className="shortlist-tray__title">
          <BookmarkIcon size={16} />
          <span className="shortlist-tray__title-text">Shortlist</span>
          <span className="shortlist-tray__count">{schools.length} of {MAX_COMPARE}</span>
          <span className="shortlist-tray__note">No site is ranked. Read the facts and decide.</span>
        </div>
        <div className="shortlist-tray__actions">
          {phone ? (
            <>
              <IconButton kind="ghost" size="sm" label="Fit map to shortlist" align="bottom-right" onClick={fitToShortlist}>
                <FitIcon size={16} />
              </IconButton>
              {schools.length >= 2 && (
                <IconButton kind="ghost" size="sm" label="Full comparison table" align="bottom-right" onClick={() => setFullTableOpen(true)}>
                  <TableIcon size={16} />
                </IconButton>
              )}
              <ExportButton filenameBase="shortlist" headers={headers} rows={exportRows} label="Export shortlist CSV" iconOnly />
              <IconButton kind="ghost" size="sm" label="Clear shortlist" align="bottom-right" onClick={clearCompare}>
                <TrashIcon size={16} />
              </IconButton>
            </>
          ) : (
            <>
              <Button kind="ghost" size="sm" renderIcon={FitIcon} onClick={fitToShortlist}>Fit to shortlist</Button>
              {schools.length >= 2 && (
                <Button kind="ghost" size="sm" renderIcon={TableIcon} onClick={() => setFullTableOpen(true)}>Full table</Button>
              )}
              <ExportButton filenameBase="shortlist" headers={headers} rows={exportRows} label="Export" />
              <Button kind="ghost" size="sm" onClick={clearCompare}>Clear</Button>
            </>
          )}
          <IconButton kind="ghost" size="sm" label="Collapse shortlist" align="bottom-right" onClick={() => setShortlistOpen(false)}>
            <ChevronDown size={16} />
          </IconButton>
        </div>
      </div>

      <div className="shortlist-tray__cards">
        {schools.map((s) => {
          const p = s.properties;
          const gs = resolveGradeStyle(p.current_grade);
          const soh = ctx.sohEligibleMsids.has(p.msid);
          const plp = ctx.plp.has(p.msid);
          const coloc = ctx.coLocationMsids.has(p.msid);
          const util = utilizationStyle(p.enrollment, p.capacity, p.cofte ?? null, p.fish_surplus ?? null);
          const anchor = anchorLine(p.msid, ctx);
          const selected = p.msid === selectedMsid;
          return (
            <div key={p.msid} className={`sl-card${selected ? " sl-card--selected" : ""}`}>
              <div className="sl-card__head">
                <span
                  className="sl-card__grade"
                  style={{
                    background: rgbaToCss(gs.fill),
                    color: rgbaToCss(gs.letterColor),
                    border: `1.25px ${gs.dashed ? "dashed" : "solid"} ${rgbaToCss(gs.stroke)}`,
                  }}
                >
                  {gs.letter}
                </span>
                <IconButton
                  kind="ghost"
                  size="sm"
                  className="sl-card__remove"
                  label={`Remove ${p.name} from the shortlist`}
                  align="bottom-right"
                  onClick={() => toggleComparePin(p.msid)}
                >
                  <CloseIcon size={16} />
                </IconButton>
              </div>

              <button type="button" className="sl-card__name" onClick={() => selectSchool(p.msid)} title="Focus on the map and open details">
                {p.name}
              </button>
              <div className="sl-card__county">{p.county}</div>

              <div className="sl-card__chips">
                {soh && <Tag type="green" size="sm">SoH eligible</Tag>}
                {plp && <Tag type="red" size="sm">PLP anchor</Tag>}
                {coloc && <Tag type="teal" size="sm">Co-location</Tag>}
                {!soh && !plp && <Tag type="gray" size="sm">Not eligible</Tag>}
              </div>

              <dl className="sl-card__facts">
                <div className="sl-fact">
                  <dt>Anchor</dt>
                  <dd className={anchor.muted ? "sl-fact--muted" : ""}>{anchor.text}</dd>
                </div>
                <div className="sl-fact">
                  <dt>Facility</dt>
                  <dd>{util.label}{util.pct != null ? ` · ${util.pct}% used` : ""}</dd>
                </div>
                <div className="sl-fact">
                  <dt>Title I</dt>
                  <dd>{titleILabel(p.title_i)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <FullTableGate schools={schools} />
    </div>
  );
}

// The "Full table" modal: the full row-by-row matrix (the old Compare view) over
// a scrim, opened from the tray. Kept in its own tiny component so the lazy
// CompareView chunk only loads when the operator actually asks for it. State is
// URL-free and local to this render via a details-less approach: we reuse the
// store's shortlistFullTable flag.
function FullTableGate({ schools }: { schools: SchoolFeature[] }) {
  const open = useStore((s) => s.shortlistFullTableOpen);
  const setOpen = useStore((s) => s.setShortlistFullTableOpen);
  if (!open || schools.length < 2) return null;
  // Portal to the document body: the tray is a transformed ancestor (its slide-up
  // animation), which would otherwise make this position:fixed modal resolve
  // against the tray instead of the viewport, shifting and clipping it.
  return createPortal(
    <div className="shortlist-fulltable" role="dialog" aria-modal="true" aria-label="Full comparison table">
      <div className="shortlist-fulltable__scrim" onClick={() => setOpen(false)} />
      <div className="shortlist-fulltable__panel">
        <div className="shortlist-fulltable__head">
          <span className="shortlist-fulltable__title">Full comparison</span>
          <IconButton kind="ghost" size="sm" label="Close full table" align="bottom-left" onClick={() => setOpen(false)}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
        <div className="shortlist-fulltable__body">
          <Suspense fallback={<div className="shortlist-fulltable__loading">Loading table...</div>}>
            <CompareView />
          </Suspense>
        </div>
      </div>
    </div>,
    document.body,
  );
}
