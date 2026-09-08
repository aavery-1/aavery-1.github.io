import {
  Hct, hexFromArgb, argbFromHex, MaterialDynamicColors,
  SchemeTonalSpot, SchemeVibrant, SchemeExpressive, SchemeFidelity, SchemeContent,
} from "@material/material-color-utilities";

const SEED = "#0F62FE";
const src = Hct.fromInt(argbFromHex(SEED));
const variants = { TonalSpot: SchemeTonalSpot, Vibrant: SchemeVibrant, Expressive: SchemeExpressive, Fidelity: SchemeFidelity, Content: SchemeContent };
for (const [name, S] of Object.entries(variants)) {
  const s = new S(src, false, 0.0);
  const g = (r) => hexFromArgb(MaterialDynamicColors[r].getArgb(s));
  console.log(name.padEnd(10), "primary", g("primary"), "container", g("primaryContainer"), "secondary", g("secondary"), "tertiary", g("tertiary"));
}
