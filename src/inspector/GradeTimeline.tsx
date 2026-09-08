// Historic grade timeline. One pill per school year the school has a grade,
// placed on a horizontal year axis so gaps read as gaps. Deliberately NO trend
// line: Florida changed its grading formula around 2009-2010, 2011-2012,
// 2014-2015, and 2021-2022 (B.E.S.T. baseline reset), and a line across those
// breaks would be misleading. Instead we mark subtle vertical dividers at the
// formula-change years with a hover note.

import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import type { GradeHistoryEntry } from "../data/types";

const CHANGE_NOTE: Record<string, string> = {
  "2009-2010": "FL grading formula revised (2010). Grades before and after are not directly comparable.",
  "2011-2012": "FL grading formula revised (2012). Grades before and after are not directly comparable.",
  "2014-2015": "FL grading formula revised (2015). Grades before and after are not directly comparable.",
  "2021-2022": "B.E.S.T. standards baseline reset (2022). Grades before and after are not directly comparable.",
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
    return <div className="empty-state">No grade history on record for this school.</div>;
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

  return (
    <div className="grade-timeline" role="img" aria-label="Historic letter grades by school year, with dividers at formula-change years and no trend line">
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
                      title={`${slot.year}: ${style.description}`}
                    >
                      {style.letter}
                    </span>
                  );
                })()
              ) : (
                <span className="grade-pill grade-pill-gap" title={`${slot.year}: no grade on record (gap)`} aria-label={`${slot.year} gap`}>
                  &middot;
                </span>
              )}
              <span className="timeline-year mono">{`'${String(startYear(slot.year)).slice(2)}`}</span>
            </div>
          );
        })}
      </div>
      <div className="timeline-hint">Dividers mark formula-change years. Grades across a divider are not directly comparable.</div>
    </div>
  );
}
