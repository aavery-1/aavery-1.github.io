// A DOM twin of the map's rich school marker: the school-type shape tinted by
// grade, a white keyline, a soft shadow, and the grade letter. Used wherever the
// UI shows "this pin" (the hover card, the legend) so the chrome and the map
// draw the same object. Colors come from gradeEncoding (the source of truth the
// map draws from); geometry from markerShapes.

import { GRADE_STYLES, rgbaToCss, type Grade } from "./gradeEncoding";
import { shapeSvgElement, type MarkerShape } from "./markerShapes";

export function GradePin({
  grade,
  shape = "circle",
  size = 22,
  title,
}: {
  grade: Grade;
  shape?: MarkerShape;
  size?: number;
  title?: string;
}) {
  const s = GRADE_STYLES[grade];
  const multi = s.letter.length > 1;
  return (
    <span
      className="grade-pin"
      data-shape={shape}
      style={{ width: size, height: size, fontSize: Math.round(size * (multi ? 0.4 : 0.52)) }}
      title={title ?? s.description}
      role="img"
      aria-label={s.description}
    >
      <svg viewBox="-8 -8 116 116" width={size} height={size} aria-hidden>
        <g
          fill={rgbaToCss(s.fill)}
          stroke="#ffffff"
          strokeWidth={12}
          strokeLinejoin="round"
          strokeDasharray={s.dashed ? "14 10" : undefined}
          style={{ paintOrder: "stroke" }}
          dangerouslySetInnerHTML={{ __html: shapeSvgElement(shape) }}
        />
      </svg>
      <span className="grade-pin__letter" style={{ color: rgbaToCss(s.letterColor) }}>{s.letter}</span>
    </span>
  );
}
