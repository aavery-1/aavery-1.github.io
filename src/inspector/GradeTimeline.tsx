// Historic grade timeline. One pill per school year the school has a grade,
// placed on a horizontal year axis so gaps read as gaps. Deliberately NO trend
// line: Florida changed its grading formula around 2009-2010, 2011-2012,
// 2014-2015, and 2021-2022 (B.E.S.T. baseline reset), and a line across those
// breaks would be misleading. Instead we mark subtle vertical dividers at the
// formula-change years with a hover note.

import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import type { GradeHistoryEntry } from "../data/types";

const CHANGE_NOTE: Record<string, string> = {
  "2009-2010": "FL changed the grading formula in 2010. Grades on either side aren't comparable.",
  "2011-2012": "FL changed the grading formula in 2012. Grades on either side aren't comparable.",
  "2014-2015": "FL changed the grading formula in 2015. Grades on either side aren't comparable.",
  "2021-2022": "B.E.S.T. standards reset the baseline in 2022. Grades on either side aren't comparable.",
};

function startYear(academicYear: string): number {
  return parseInt(academicYear.slice(0, 4), 10);
}

export function GradeTimeline({
  history,
  formulaChangeYears,
}: {
  history: GradeHistoryEntry[];
  formulaChangeYears: string[];
}) {
  if (!history || history.length === 0) {
    return <div className="empty-state">No grade history on record.</div>;
  }

  const byYear = new Map(history.map((h) => [h.year, h.grade]));
  const starts = history.map((h) => startYear(h.year));
  const min = Math.min(...starts);
  const max = Math.max(...starts);

  const slots: Array<{ year: string; grade: string | null }> = [];
  for (let y = min; y <= max; y++) {
    const label = `${y}-${y + 1}`;
    slots.push({ year: label, grade: byYear.get(label) ?? null });
  }
  // Most-recent year FIRST (leftmost), reading back in time to the right. This
  // is a recency-first read (the current grade is what a siting decision turns
  // on), unlike a continuous time-series axis, so the reversed year labels below
  // make the direction explicit. With newest on the left, a formula-change
  // divider now sits on the RIGHT edge of its year (the boundary to the older
  // year beside it); see .timeline-divider in styles.css.
  slots.reverse();

  // House convention for school years: FULL form "SY2020-2021", compact axis form
  // the END year "SY21".
  const syFull = (y: string) => (/^\d{4}-\d{4}$/.test(y) ? `SY${y}` : y);
  const syShort = (y: string) => (/^\d{4}-\d{4}$/.test(y) ? `SY${y.slice(-2)}` : y);

  return (
    <div className="grade-timeline" role="img" aria-label="Letter grades by school year, most recent first, with dividers at formula-change years">
      <div className="timeline-track">
        {slots.map((slot) => {
          const isChange = formulaChangeYears.includes(slot.year);
          return (
            <div className="timeline-slot" key={slot.year}>
              {isChange && (
                <span className="timeline-divider" title={CHANGE_NOTE[slot.year] ?? "Formula change year"} aria-label={CHANGE_NOTE[slot.year]} />
              )}
              {slot.grade ? (
                (() => {
                  const style = resolveGradeStyle(slot.grade);
                  return (
                    <span
                      className="grade-pill"
                      style={{
                        background: rgbaToCss(style.fill),
                        color: rgbaToCss(style.letterColor),
                        borderColor: rgbaToCss(style.stroke),
                        borderStyle: style.dashed ? "dashed" : "solid",
                      }}
                      title={`${syFull(slot.year)}: ${style.description}`}
                    >
                      {style.letter}
                    </span>
                  );
                })()
              ) : (
                <span className="grade-pill grade-pill-gap" title={`${syFull(slot.year)}: no grade on record (gap)`} aria-label={`${syFull(slot.year)} gap`}>
                  &middot;
                </span>
              )}
              <span className="timeline-year mono">{syShort(slot.year)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
