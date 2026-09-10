// Compare view: a side-by-side matrix of 2 to 4 pinned sites, opened from the
// shortlist tray's "Full table". Columns are sites, rows are attributes, grouped
// into labelled sections in decision order. Built on native @carbon/react (Button,
// IconButton, Tag, ComboBox, Toggle) and the app's shared encodings, so it matches
// the rest of the tool rather than the old MUI island. The design follows the
// comparison-table canon (NN/g, Baymard, Best Buy):
//
//   - Sites across the top, attributes down the left, so one attribute scans
//     across every site in a single horizontal sweep.
//   - A sticky identity header (grade, name, flags) and a sticky row-label column,
//     so you never lose which site a value belongs to or which row you are on.
//   - "Differences only" hides rows every site shares; differing rows are always
//     marked (a neutral dot and a heavier value), never ranked.
//   - On a phone the label column narrows and site columns size to ~46vw, so the
//     label plus a site and a half stay on screen and the rest is one swipe away.
//
// No site is ranked and no aggregate score is shown: the tool lays out the facts
// and the analyst forms the judgment. Every value comes from the always-available
// spatial indexes (see compareModel), so a fact is populated regardless of which
// map overlays are toggled on. No em dashes in this file.

import { Fragment, useMemo, useState } from "react";
import { Button, IconButton, ComboBox, Toggle, DismissibleTag } from "@carbon/react";
import { Close as CloseIcon, Compare as CompareIcon } from "@carbon/icons-react";
import { useData } from "../data/DataContext";
import { useStore, MAX_COMPARE } from "../store";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { ExportButton } from "../tools/ExportButton";
import { buildCompareSections } from "./compareModel";
import type { SchoolFeature } from "../data/types";
import "./CompareView.carbon.css";

// Eligibility-pill colors are data encoding, not chrome, so they stay literal.
const GREEN_MID = "#047857";
const RED_STRONG = "#B71C1C";

type AddItem = { msid: string; label: string };

export function CompareView() {
  const data = useData();
  const { ctx } = useFilteredSchools();
  const comparePinnedMsids = useStore((s) => s.comparePinnedMsids);
  const toggleComparePin = useStore((s) => s.toggleComparePin);
  const clearCompare = useStore((s) => s.clearCompare);
  const selectSchool = useStore((s) => s.selectSchool);
  const [differencesOnly, setDifferencesOnly] = useState(false);

  const schools = useMemo(
    () =>
      comparePinnedMsids
        .map((msid) => data.schools?.features.find((f) => f.properties.msid === msid))
        .filter((f): f is SchoolFeature => Boolean(f)),
    [comparePinnedMsids, data.schools],
  );

  const sections = useMemo(() => buildCompareSections(schools, ctx, data), [schools, ctx, data]);

  // Schools available to add (not already pinned), for every "Add a site" picker.
  const addable = useMemo<AddItem[]>(
    () =>
      (data.schools?.features ?? [])
        .filter((f) => !comparePinnedMsids.includes(f.properties.msid))
        .map((f) => ({ msid: f.properties.msid, label: `${f.properties.name} (${f.properties.county})` })),
    [data.schools, comparePinnedMsids],
  );
  const canAdd = schools.length < MAX_COMPARE;

  // Fewer than two sites is the empty / building state: teach the feature and let
  // the analyst assemble the set without leaving the view.
  if (schools.length < 2) {
    return <CompareEmptyState pinned={schools} addable={addable} onAdd={toggleComparePin} onRemove={toggleComparePin} />;
  }

  // Export uses the flat row set (all rows, ignoring the differences filter).
  const flatRows = sections.flatMap((sec) => sec.rows);
  const headers = ["Field", ...schools.map((s) => s.properties.name)];
  const exportRows: Array<Array<unknown>> = [
    ["MSID", ...schools.map((s) => s.properties.msid)],
    ...flatRows.map((r) => [r.label, ...r.values]),
  ];

  const visibleSections = sections
    .map((sec) => ({ ...sec, rows: differencesOnly ? sec.rows.filter((r) => r.diff) : sec.rows }))
    .filter((sec) => sec.rows.length > 0);
  const noDifferences = differencesOnly && visibleSections.length === 0;
  const totalCols = schools.length + 1;

  return (
    <div className="compare-root">
      {/* Toolbar: identity on the left, the row of controls on the right. */}
      <div className="compare-toolbar">
        <div className="compare-toolbar__identity">
          <div className="compare-titlebox">
            <CompareIcon size={18} style={{ color: "var(--focus)", flex: "none" }} />
            <h2 className="compare-title">Comparing {schools.length} sites</h2>
            <span className="compare-title__count">of {MAX_COMPARE}</span>
          </div>
          <p className="compare-note">No site is ranked. Read the facts and decide.</p>
        </div>
        <div className="compare-controls">
          {canAdd && <AddSite className="compare-add" size="md" placeholder="Add a site" addable={addable} onAdd={toggleComparePin} />}
          <Toggle
            id="compare-diff"
            className="compare-diff"
            size="sm"
            labelText="Differences only"
            labelA=""
            labelB=""
            toggled={differencesOnly}
            onToggle={(v) => setDifferencesOnly(v)}
          />
          <ExportButton filenameBase="compare" headers={headers} rows={exportRows} label="Export" />
          <Button kind="ghost" size="sm" onClick={clearCompare}>Clear</Button>
        </div>
      </div>

      {/* The matrix. A single scroll container so the sticky header and sticky
          label column pin against the same viewport; site columns scroll under a
          fixed identity row when the window is too narrow to fit them all. */}
      <div className="compare-scroll">
        {noDifferences ? (
          <div className="compare-empty-msg">
            <p>These sites match on every compared field. Turn off &quot;Differences only&quot; to see the full comparison.</p>
          </div>
        ) : (
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-corner" scope="col">
                  <span className="compare-corner__label">Field</span>
                </th>
                {schools.map((s) => (
                  <SiteHeaderCell
                    key={s.properties.msid}
                    school={s}
                    isSoh={ctx.sohEligibleMsids.has(s.properties.msid)}
                    isPlp={ctx.plp.has(s.properties.msid)}
                    onOpen={() => selectSchool(s.properties.msid)}
                    onRemove={() => toggleComparePin(s.properties.msid)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSections.map((sec) => (
                <Fragment key={sec.title}>
                  <tr>
                    <td className="compare-section-cell" colSpan={totalCols}>
                      <span className="compare-section-title">{sec.title}</span>
                    </td>
                  </tr>
                  {sec.rows.map((r) => (
                    <tr key={r.key} className="compare-row">
                      <th className="compare-label" scope="row">
                        <span className="compare-label__inner">
                          <span className={`compare-diff-dot${r.diff ? " compare-diff-dot--on" : ""}`} aria-hidden />
                          <span
                            className={`compare-label-text${r.help ? " compare-label-text--help" : ""}`}
                            title={r.help ?? undefined}
                          >
                            {r.label}
                          </span>
                        </span>
                      </th>
                      {r.values.map((v, i) => (
                        <td key={schools[i].properties.msid} className={`compare-value${r.diff ? " compare-value--diff" : ""}`}>
                          <p className={`compare-value-text${r.diff ? " compare-value-text--diff" : ""}`}>{v}</p>
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// A filterable "Add a site" picker (Carbon ComboBox). It resets after each pick by
// bumping a key, so the input clears and the just-added site drops off the list.
function AddSite({ addable, onAdd, placeholder, size, className }: {
  addable: AddItem[];
  onAdd: (msid: string) => void;
  placeholder: string;
  size: "sm" | "md" | "lg";
  className?: string;
}) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <ComboBox
      key={resetKey}
      id="compare-add-site"
      className={className}
      size={size}
      items={addable}
      itemToString={(i: AddItem | null) => i?.label ?? ""}
      placeholder={placeholder}
      selectedItem={null}
      titleText=""
      aria-label={placeholder}
      onChange={({ selectedItem }: { selectedItem?: AddItem | null }) => {
        if (selectedItem) { onAdd(selectedItem.msid); setResetKey((k) => k + 1); }
      }}
    />
  );
}

// One site's identity header: grade badge, name (opens the inspector), county,
// eligibility pills, and a remove control. Sticky top via the table header; a
// bottom border keeps it legible over the scrolling rows.
function SiteHeaderCell({ school, isSoh, isPlp, onOpen, onRemove }: {
  school: SchoolFeature; isSoh: boolean; isPlp: boolean;
  onOpen: () => void; onRemove: () => void;
}) {
  const p = school.properties;
  const gs = resolveGradeStyle(p.current_grade);
  return (
    <th className="compare-site-header" scope="col">
      <div className="compare-site">
        <span
          className="compare-grade"
          title={gs.description}
          style={{
            background: rgbaToCss(gs.fill),
            color: rgbaToCss(gs.letterColor),
            borderColor: rgbaToCss(gs.stroke),
            borderStyle: gs.dashed ? "dashed" : "solid",
          }}
        >
          {gs.letter}
        </span>
        <div className="compare-site-main">
          <button type="button" className="compare-site-name" onClick={onOpen} title="Open in the details panel">
            {p.name}
          </button>
          <div className="compare-site-county">{p.county}</div>
          {(isSoh || isPlp) && (
            <div className="compare-site-pills">
              {isSoh && <Pill label="SoH eligible" color={GREEN_MID} />}
              {isPlp && <Pill label="PLP" color={RED_STRONG} />}
            </div>
          )}
        </div>
        <IconButton kind="ghost" size="sm" className="compare-remove" label={`Remove ${p.name} from compare`} align="bottom-right" onClick={onRemove}>
          <CloseIcon size={16} />
        </IconButton>
      </div>
    </th>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="compare-pill"
      style={{ color, borderColor: color, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      {label}
    </span>
  );
}

// Guided empty / building state, shown at 0 or 1 pinned sites. Teaches what the
// view does and lets the analyst assemble the set right here, so the view is
// never a dead end.
function CompareEmptyState({ pinned, addable, onAdd, onRemove }: {
  pinned: SchoolFeature[];
  addable: AddItem[];
  onAdd: (msid: string) => void;
  onRemove: (msid: string) => void;
}) {
  return (
    <div className="compare-empty">
      <div className="compare-empty-card">
        <div className="compare-empty-stack">
          <div className="compare-empty-icon">
            <CompareIcon size={26} style={{ color: "var(--focus)" }} />
          </div>
          <div>
            <h2 className="compare-empty-title">Compare sites side by side</h2>
            <p className="compare-empty-desc">
              Pin 2 to {MAX_COMPARE} schools to line up their grades, eligibility, capacity,
              districts, and community context. No site is ranked. Read the facts and decide.
            </p>
          </div>

          {pinned.length > 0 && (
            <div className="compare-empty-chips">
              {pinned.map((s) => (
                <DismissibleTag
                  key={s.properties.msid}
                  type="teal"
                  text={s.properties.name}
                  onClose={() => onRemove(s.properties.msid)}
                />
              ))}
            </div>
          )}

          <AddSite
            className="compare-empty-add"
            size="md"
            placeholder={pinned.length === 0 ? "Add the first site" : "Add one more site"}
            addable={addable}
            onAdd={onAdd}
          />

          <p className="compare-empty-footnote">
            You can also pin from the list or a school&apos;s details panel.
            Pinned sites are saved in the page link.
          </p>
        </div>
      </div>
    </div>
  );
}
