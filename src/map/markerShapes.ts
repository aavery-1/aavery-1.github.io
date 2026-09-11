// School-type shape channel for the map markers. Grade owns color (see
// gradeEncoding.ts); operator type owns SHAPE, so a viewer can read both at once
// without either channel interfering with the other.
//
//   District (Traditional)  circle
//   Charter                 square
//   Magnet                  diamond
//   Virtual                 triangle
//   Alternative             hexagon
//   Other                   circle (fallback)
//
// Each shape is a solid white SVG on a transparent field, packed as an IconLayer
// mask. deck.gl tints a mask icon with getColor, so one white shape serves every
// grade: the icon supplies the outline, getColor supplies the grade fill.

import type { SchoolType } from "../data/types";

export type MarkerShape = "circle" | "square" | "diamond" | "triangle" | "hexagon";

// A human label for the shape, used by the legend.
export const SHAPE_FOR_TYPE: Record<SchoolType, MarkerShape> = {
  Traditional: "circle",
  Charter: "square",
  Magnet: "diamond",
  Virtual: "triangle",
  Alternative: "hexagon",
  Other: "circle",
};

export function shapeForType(type: SchoolType): MarkerShape {
  return SHAPE_FOR_TYPE[type] ?? "circle";
}

// The school types that carry a distinct shape on the map, in legend order, with
// the user-facing label. "Traditional" reads as "District" everywhere in the UI.
export const SHAPE_LEGEND: Array<{ label: string; shape: MarkerShape }> = [
  { label: "District", shape: "circle" },
  { label: "Charter", shape: "square" },
  { label: "Magnet", shape: "diamond" },
  { label: "Virtual", shape: "triangle" },
  { label: "Alternative", shape: "hexagon" },
];

// An inline-SVG path/shape element (as a string) for a DOM legend swatch, drawn
// on the same 0..100 box the map icons use so the legend matches the map exactly.
export function shapeSvgElement(shape: MarkerShape): string {
  switch (shape) {
    case "circle":
      return `<circle cx="50" cy="50" r="44" />`;
    case "square":
      return `<rect x="8" y="8" width="84" height="84" rx="12" />`;
    case "diamond":
      return `<polygon points="50,4 96,50 50,96 4,50" />`;
    case "triangle":
      return `<polygon points="50,10 92,88 8,88" />`;
    case "hexagon":
      return `<polygon points="50,5 90,28 90,72 50,95 10,72 10,28" />`;
  }
}

// Each shape is a white glyph on a transparent 100x100 field. These are BAKED at
// build time, not drawn at runtime: an earlier version rendered them into a
// <canvas> and read them back with toDataURL, but privacy browsers that farble
// canvas readback (Brave, hardened Firefox, Tor) return a blank image from that
// call, which left every marker invisible while the basemap rendered fine. A
// constant data URL is loaded straight into deck's icon atlas as an image, so it
// is immune to that. The strings below were produced once from the exact shape
// geometry (points kept a touch inside the box so a larger "stroke" copy can sit
// behind a smaller "fill" copy and read as an outline); regenerate them from
// drawShape() in git history if the geometry ever changes.
const SIZE = 100;

const SHAPE_PNG: Record<MarkerShape, string> = {
  circle:
    "data:image/png;base64,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",
  square:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAC6klEQVR4AeydUVLjMBBEnb3YsicjnIzdk2VnKJuqfGBJLQ004VFSOcGe1uS9mhR//Nr4sSKAECsd24YQhJgRMGuHCUGIGQGzdpgQhJgRMGtHnpDb7fYU+3XfcWEFgeRxjetV9TwsJA57ExEHvsZ+2ndcWEEgeTzH9Tk45RoWMyQkTsgDDhFx7geLXx8EUkwyO943r91CdhlpvxnKA3cEhqR0CUHGHWDlTUrJr7NmbZeQSGEyAsLk6mLYFLJPx2QvlAeB/GOoOSVNIRHEWkegOSU9Qn6v64ekFoEeIc0xax3C/XcCTZY9Qt7TeFFPACH1jIdO+E5Chj7Yd30YIWbmEIIQMwJm7TAhCDEjYNYOE4IQMwJm7TAhCDEjYNYOE4IQMwJm7TAhCDEjYNYOE4IQMwJm7TAhCDEjYNYOE4IQMwJm7TAhNULkVITI6GoKEVLDVU5FiIyuphAhNVzlVITI6GoKEVLDVU5FiIyuphAhNVzlVITI6GoKEVLDVU49FSKnUigTQIiMrqYQITVc5VSEyOhqChFSw1VORYiMrqYQITVc5VSEyOhqChFSw1VORYiMrqbwC4TUfJBHSUWImUmEIMSMgFk7TAhCzAiYtcOEIMSMgFk7TAhCzAiYtfMwE2LGVW4HITK6mkKE1HCVUxEio6spREgNVzkVITK6mkKE1HCVUxEio6spREgNVzkVITK6mkKEnHL9/JsI+Xzmpyf2CPl7msDNEQJNlj1CRg7k2XMC/85vb1uPkJdWCPfXEWgKuVwuOWa51136g1PC5fM/ovbFrKwY0t2EhGWLoRc0m+0JiWr8CNjRC3/iORNCEhD/8AxAT0Qa2lizVR3aQb28ZBqOgcaOLIjcTk3lgqtiHzitxk9lQ9PbLdMWLfLvOWWjWLnfSKzhSCEIcCJKrfmB7hMTQNVL3WsW6zt5C9tglViWMufkZbUZfBPBmC8CoLYW4ANE+f+HzHnEsD8AAAD//5BdMFwAAAAGSURBVAMAglkgW+bnkbwAAAAASUVORK5CYII=",
  diamond:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAADrElEQVR4AezXi1KDQAyF4dYXV5+89neKA3LpXpJsAnEaQQrJ7vnG6fTjlj+uEkgQVxy3W4IkiHwCj8fji5LvbN8x/H/IC+LzGd3n6/x5GvcVGuQFAMYkEB4lLMgGxilQQoIcYIRHCQdSgBEaJRRIBUZYFB2QKQ7BYwPGND3UB30IkA6McCjuQQQwQqG4BhHECIPiFkQBIwSKSxBFDPco7kAMMFyjuAIxxHCL4gZkAIZLFBcgAzHcoQwHqcCYwtM6uvhGPxTEEcaEPBxlGIhDDBcoQ0AcYwxHMQcJgDEUxRQkEMYwFDOQgBhDUExAAmOYo6iDnADDFEUV5EQYZihqIGEwpqjLj6pfHlVATowxsamhiINcAEMVRRTkQhhqKGIgF8RQQREBuTCGOEo3SGJMJjeRD/oukMT4w5hOulGaQRJjMlgdu1CaQBJjhfD/QjNKNUhi/M9+828uNqFUgSQGOVdVNUoxSGJUQcxvrkIpAkmMeb5N58Uob0ESowlg66EilEOQxNjKtevaW5RdkMToCv7o4UOUTZDEOMpT5L1dlBVIYogEXtJkE2UBkhglOYres0JZgIiOymZNCSxA7vf717PL97N+X/lLPYHvV+Z/gxYgXH3dkCiEoVsrDMatQLiYKKSgWpsYTNwE4Y1EIQWV2sVg2i4IbyYKKYjWIQaTDkG4IVFIQaTeYjDlLQg3JQopdFURBhOKQLgxUUihqYox6F4Mws2JQgpVVYVB5yoQHkgUUiiqagy6VoPwUB8KHU5fTRik0gTCg4lCCpvVjEG3ZhAeThRSWFQXBp26QGiQKKTwW90YdOkGoUmi3EQwyFIEhEYXRhHDIEcxEJpdEEUUgwxFQWh4IRRxDPITB6HpBVBUMMhOBYTGJ0ZRwyA3NRCaW6Iwz6BUMVi/KggDToSijkFe6iAMOQGKCQZZmYAwKDCKGQY5mYEwLCCKKQYZmYIwMBCKOQb5mIMwNADKEAyyGQLCYMcowzDIZRgIwx2iDMUgk6EgLMARynAM8hgOwiIcoOxgsDrbcgHClgeiuMEgBzcgLGYAiisMMnAFwoIMUdxhsH93ICzKAMUlBnt3CcLCFFHcYrBvtyAsTgHFNQZ7dg3CAgVR3GOwX/cgLFIAJQQGew0BwkI7UMJgsM8wICy2AcUlBnvZq1AgbKICJRwG+wsHwqILUEJisLeQICz8ACUsBvsKC8LiN1BCY7Cn0CBsYIYSHoP9hAdhE6BQnEevU4BER5ivP0HmaTg4/wEAAP//Bu+m+wAAAAZJREFUAwAekNTYluupzwAAAABJRU5ErkJggg==",
  triangle:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAER0lEQVR4AeybDXYaMQyESS/W9GRwczrm2YQkrNeW9burPhGTeG1L82keG0L/XPKfKwUSiCscl0sCSSDOFHCWTjokgThTwFk66ZAE4kwBZ+kcwiH3+/2Gx6czbUnpHAJIrfxax9CDDBBFSeCMG44rMD7xPLxLwgOpMDA8ooB5PIn6JTQQOKK441X78C4JDQQk3jni3c9waYwIC+SNO5rioV0SFgjU7zmhN4elfiMkkI47mtLFJT9fX9qc6zEkECg64oCRa7CVrwgHZMAdT4Vnrn0uMn4SDgj0mun8mWuxtX1EAnKhdDxljSWWUEAgFKXjr4AS5i2VMEAg6spdEwUk+OtHGCCQZkXUchscwiUhgCy6AywfsQL0sYHGF/dAAKN0NoeYIVziHgi6sgDBwBIcYFkS2drENRC4o7yQc4ro3iWugWx10eLPOQEvpvJ7uVsgAu5o1bt2iVsgUO8vHlLx5RKpE4j7ugRS3cH5Yv5THrcucQkE6ml0sMYZKGUu3AGp7pirgna1S5e4AwJtNTtX8yyUth+ugCi6oylTXFJ+12nfm4+ugEANi461OBOlvg83QAzc8VTE8uxnEvWJGyDIx7JTLc9G6V/hAoiHDvWQQ8HiAggS8dChnH/qRUm0MAfipTOrfOaNYQ4EQpiLgBxalNtgybds2jmboykQZ+5oIpk2iCkQKGBaPM5/F6YuMQPi1B0NkFmjmACpMMyKbqp3RjOXmADpCOFpyqRh1IEEcEdrChOXqANp1QYZ1V2iCiSQO1q/qLukC6RlxTiqdxxD7qo5qwGp7mDQR30LVZeoAYGMqp2G8zhDLXcVIIHd0aCquUQFCKpS6zCcJRUqNYgDOYA7GuDiEvEPRIgDQTUqnYVzNEK8FlEgB3LHE7Z0TaJAUIV4R+EM7RCtSQyIdCdpU3g9T7I2MSAoYKOTMBM/xD4QIQJEsoMcsRRpOBEgEE0kWezrKcptMPsHItiBnMQdrTHYG48VCGCUjmFPslXvcGR3CSsQCFaAYDhVsDYgGxC4o7ytwJpcEKysLmEDEkQ8qTTZGpEFyInd0QCzuYQFCLKS/D/l2D5EsLhkGUh1h/mLuQNkLC5ZBgIhWDoD+xwhlrVYAlLdcQQhuWpYdskSEFSx3BHY42ixpAkZSLpjs4+KS8rvZJsX9CbIQLDpUidg/ZGDrA0JSLpjv5eoGpGAIB1yB2DtWYKk0TQQKvmzUHitk6LVNBAcSCKPdWeM6T/1TgGhEI9NgSX7qQaeAoL0pjbH9RmXS7kNHn5raRhIumOpt66jq4eBYMPhTXFtxncFhl0yBCTd8V1d4ndDDb0LpMIY2oyY6FmWDblkF8hZ1FKqc7exd4F8fHzc8MjgUeDfHvhdIHsb5DyvAgmEV8/l3RLIsoTzG/RWJJCeOgZzCcRA9N6RCaSnjsFcAjEQvXdkAumpYzCXQAxE7x2ZQHrqGMwlEAPRe0f+BwAA///haQRuAAAABklEQVQDAO7XUNg6t3liAAAAAElFTkSuQmCC",
  hexagon:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAEjklEQVR4AeycUVbjMAxFm1kZrAxYGews824PgtBDS6xGjpxqjjVxgy1L71by8DP/TvUnlQIFJBWO06mAFJBkCiQLZ/gKmef5SfYue02mrSucoYF8QnhX5k+yF31mDA1mSCBS/VU2A0F2OYYGMxQQQTi3JxF4kf01ADNcKxsCyAKEtae/YNjPrZUN08bSAxEMxGwFYUDsSbXI1Ywve5fyGQNkg1SlHu1plqs17UnLVo30YNIB+QRBRWCrVHYsAkzK+yUNkAsQ9H6Hzk1bOAMwqdpYCiCCgShUBCI1qbrBYqAohJkYNnB3n4tdgUgF7glAbHlPeBVJAWYXIAsQwNijKm5BAwy/eO5SMV2BJAexhETFnsEsX/aYdwMiGHzjMlbELZ2BotD73S/hQJRNpnvilvi3ftYNTBiQBYjRquIvMNwvYfdeCBDBAAK2ZeC3hOr5M+6XsF8qNwUiEHx7ZqlzRBBK68cIaWObABGII9wTP9Ru+LApmLuALEActT01cDkBhg5xV3dwAxGMEf8Z2yKwZ+3d90szEEDIuCc43BP0I+yhWpCJL21TvquByPsj3xNNoi4WN4NZDUSH1D0hEZxjdTdpAeKMpba1KFBAWtTqsLaAdBC55YgC0qJWh7UFpIPILUcUkBa1OqwtIB1EbjmigLSo1WFtAekgcssRBaRFrQ5rC0gHkVuOKCAtanVYW0BiRHZ7LSBu6WI2FpAYXd1eC4hbupiNBSRGV7fXAuKWLmZjAYnR1e21gLili9lYQGJ0dXstIG7pYjYWkBhd3V5vAnF7rY1uBQqIW7qYjQUkRle31wLili5mYwGJ0dXttYC4pYvZWEBidHV7LSBu6WI2FpAYXd1eC4hbupiNOwCJSeQoXgtIMpIFpIAkUyBZOFUhBSSZAsnCqQopIMkUSBZOVUgBSaZAsnAOUyHJdHWHU0Dc0sVsbAHyFhPC4b1+KMNn2aqxGsg0Ta+ySV4LjERYOd6k2bMMKKu2rAZi3uS8wJgY15+AkFRT3P8od3m2TuMwSrEq5lscKoGKQJvvtw2z5gpZ+haUDxmHPzoUAwEM5kuZmuZ3AbGTgCKb9PkRwdCe7gYh7c5jEyBnT/pLUB7pfqE7KOWJDqHstxmbArGQFCVBHvV+oSVREeRnKW/2DAFCdILCNwgwA7cxMvmyLxDk9vV240kYEItTwR+hjW16T5g2vz3Dgdihg4KxqqDSLZXQZzcglgVgNKeNYZqmHAaCu4J5tyC7AyEzoGCaZ4OC+EDAmCvEvmMXIJYiUGSTPmcA0+2eUL5Xx65ALCpB2fPipxKoiG73hOX92zMFEAsMMJpTLYikaejgDEBgzEMPW+s8FRCCBoqMX7oAw6sIAwKWBoQlmQ6IBSYoEW2Me0Kup3QgLO+0QCxAqbcFGABQESnuCcvtt2d6IBY0YDSnjSGupqsGawGBMV+1ac9FwwBBJKDI1t4vtKdhQJAfNhQQAsYE5VYbA4SWTOnbE7lc2pBALAmpvgRDS6IihgRhOQ0NxJL4BAMMoNjrIZ+HADKk8leCLiBXhNnrdQHZS/kr5/4HAAD//+AQLTgAAAAGSURBVAMAlIyA2N/kPdQAAAAASUVORK5CYII=",
};

// IconLayer getIcon descriptor for a shape. Memoized so the same object identity
// is reused per shape (deck caches its atlas by icon id).
const ICON_CACHE = new Map<MarkerShape, { id: string; url: string; width: number; height: number; mask: boolean; anchorX: number; anchorY: number }>();

export function iconForShape(shape: MarkerShape) {
  let icon = ICON_CACHE.get(shape);
  if (!icon) {
    icon = { id: shape, url: SHAPE_PNG[shape], width: SIZE, height: SIZE, mask: true, anchorX: 50, anchorY: 50 };
    ICON_CACHE.set(shape, icon);
  }
  return icon;
}
