# 07 — Content style guide

How we write the words in Hope Siting: information panels, tooltips, labels,
empty states, and any copy that explains a policy fact. The goal is that a
school-district analyst or a charter operator can read a panel in two seconds and
know the answer, without decoding statute citations or jargon.

This guide is adopted from the established content-design systems, chosen for how
well they fit a data tool that explains government eligibility rules:

- **GOV.UK / Government Digital Service** — the gold standard for putting complex
  legal and eligibility content into plain English. "This isn't dumbing down,
  this is opening up government information to all."
  ([clear language](https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/),
  [content principles](https://www.gov.uk/government/publications/govuk-content-principles-conventions-and-research-background/govuk-content-principles-conventions-and-research-background))
- **IBM Carbon** — our UI is built on Carbon, so its content rules are directly
  ours: "simple, clear, and easy to understand... short words over long
  impressive-sounding words," sentence case, and a hard line between tooltips
  (supplementary) and always-visible helper text (vital).
  ([writing style](https://v10.carbondesignsystem.com/guidelines/content/writing-style/),
  [tooltip usage](https://carbondesignsystem.com/components/tooltip/usage/))
- **Shopify Polaris** — "the shortest, clearest way to give people only the info
  they need to take action"; start with verbs; be direct.
  ([product content](https://polaris.shopify.com/content/product-content))
- **Nielsen Norman Group** — plain language, front-loaded ("inverted pyramid"),
  scannable.

## The five rules

### 1. Lead with the answer, then the evidence

Put the plain-language verdict first. The supporting numbers and the reason come
after, in that order. Never make the reader assemble the conclusion from a
clause-by-clause recital.

- **Before:** "Not PLP: only 0 of last 5 graded years below C (need 3); recent 2
  include B or higher (A, A)."
- **After:** "No. Graded A and A recently, with none of its last 5 grades below C
  (it takes 3)."

### 2. Get statute citations out of the reading path

Rule and F.S. numbers are references, not prose. They never sit mid-sentence.
Put them on their own muted line under the sentence they support (the `cite`
slot), or in a tooltip. The sentence reads the same to a person who ignores the
citation and to a lawyer who checks it.

- **Before:** "...within 5 miles of Lloyd Estates Elementary School (1.2 mi), per
  Rule 6A-1.0998271(5)(e). Not checked: co-location also excludes buildings
  placed into service within the last 4 years (Rule (5)(f)); no building-age
  data."
- **After:** headline sentence, then a muted line: "Rule 6A-1.0998271(5)(e)",
  then a separate muted caveat: "One test we can't check: buildings opened in the
  last 4 years don't qualify, and we don't have building-age data."

### 3. Everyday words; explain every acronym once

Short word over long. Follow GOV.UK's list: *use* not *utilize*, *about* not
*approximately*, *estimates* not *approximates*, *for example* not *e.g.*,
*such as* not *i.e.*, *helps* not *facilitates*.

The tool's domain acronyms (PLP, COFTE, FISH, QOZ, MSID) are jargon. On first use
in a panel, spell them out or gloss them in the same breath; anywhere they must
stay short, attach a definition tooltip. Never leave a bare acronym as the whole
explanation.

- *PLP* → "persistently low-performing"
- *COFTE* → "a full-time-equivalent enrollment count"
- *FISH student stations* → "the state's permanent-capacity count"
- *QOZ* → "Qualified Opportunity Zone"

### 4. Say it positively; one idea per sentence

No double negatives, no "Not checked:" as a lead-in, no stacked semicolons.
State what IS true, then the exception. Keep sentences under ~25 words and to one
idea. Active voice ("we use reported enrollment", not "reported enrollment is
used").

- **Before:** "Approximates the statutory Facility Utilization Rate (COFTE / FISH
  student stations, Rule 6A-1.0998271(1)(n)) using reported membership
  enrollment; it is a proxy, not the official COFTE-based rate."
- **After:** "Estimated. The official rate compares COFTE enrollment to FISH
  student stations; this uses reported enrollment instead." + muted cite.

### 5. Sentence case, and match the word to the gravity

Sentence case everywhere except proper nouns and the school-grade letters
(Carbon). A verdict a user acts on ("A School of Hope may open here") can be
confident; a caveat about missing data stays plain and quiet. Don't dramatize
policy facts, and don't bury a disqualifier in cheerful copy.

## Tooltips vs. helper text (Carbon's rule, adopted)

- **Tooltip** = supplementary. Definitions and "why this matters" context.
  Sentence case, a complete sentence with punctuation, under ~150 characters.
  A user must be able to complete the task without ever opening it.
- **Helper / always-visible text** = anything vital to the decision. If losing it
  would leave the user unable to judge eligibility, it is NOT a tooltip; it stays
  on the panel.
- Never repeat the label in its own tooltip. Add what the label can't carry.

## The panel pattern (information panels)

Each fact in an info panel follows the same three-part shape, so every row reads
the same way:

1. **Label** — the field name, muted, sentence case ("Co-location candidate").
2. **Verdict** — the answer, prominent ("Yes" / "No" / a value).
3. **Reason** — one plain sentence of evidence (rule 1), then an optional muted
   **cite** line (rule 2), then an optional muted **caveat** line for a known gap.

Reason, cite, and caveat are three separate lines with descending emphasis, never
one run-on string. This is the `YesNo` component's `why` / `cite` / `caveat`
slots; reuse it rather than hand-building a paragraph.

## Visual consistency (panels, control panels, tooltips)

The design tokens already exist and are correct — `TYPE` (5 sizes: 16/14/13/12/12,
a 12px floor), the 8px spacing scale, the Carbon color roles (`SHELL_*`, `ACCENT`,
`STATUS`), square geometry, and one icon set — all in `DESIGN.md` / `muiTheme.ts`.
The job is **conformance**: components must reference the tokens, not ad-hoc px and
hex. Field basis: a shared spacing scale on a
[4px / 8px baseline grid](https://blog.designary.com/p/spacing-systems-and-scales-ui-design)
(Material builds on 4px with components at multiples of 8; Carbon uses a 2px type
grid and 8px layout grid) and a fixed
[side-panel anatomy](https://spring-20.lightningdesignsystem.com/guidelines/builder/panels/)
(Salesforce Lightning: fixed width, static section titles, contextual detail).

Rules every panel, control panel, and tooltip follows:

- **Font size:** only the 5 `TYPE` sizes. Never below 12px. Hierarchy comes from
  weight (400 body / 600 label) and color (`SHELL_ON` > `SHELL_DIM` > `SHELL_MUTED`),
  never from a 10.5px vs 11px difference. Weights are 400 and 600 only (no 700 in
  chrome; the grade-badge glyph is the one data exception).
- **Color:** semantic roles only. One eligible/success green (`STATUS.good`), one
  error red (`STATUS.error`), one interactive blue (`ACCENT` = Carbon Blue 60 —
  not a Material `#1976D2`). Data encodings (grade A-F, `UTIL_COLORS`) are the only
  literal colors and are never re-invented.
- **Spacing / padding:** the 8px scale (2/4/8/12/16/24). Card inset = `CARD_PADDING`
  (16). Section gaps and dividers use one rhythm, not a mix of 20/22/25px.
- **Dividers:** a single `SHELL_HAIRLINE` rule between sections; don't also box
  every row. Whitespace separates within a section, a divider between sections.
- **Icons:** Carbon set, 16px in panel body and actions (20px only for a primary
  affordance), inheriting `currentColor`. No mixing 14/18/20 in one panel.
- **Alignment:** labels and values left-aligned to one edge; numbers right-aligned
  in tabular columns (`fontVariantNumeric: tabular-nums`) so they scan down a rail.

## Information altitude

Each surface answers a different question at a different altitude; detail
**escalates** as the user drills in, and no fact vital to a decision hides at a
higher altitude than the decision itself.

| Altitude | Surface | Question it answers | Carries |
|---|---|---|---|
| 1 (lowest) | Map marker | what / where, at a glance | shape=type, color=grade, co-loc dot |
| 2 | Map hover tooltip | is this worth a click? | name, grade, type, utilization, co-loc + reason |
| 3 | Shortlist card | which of my few? | eligibility verdict, anchor + distance, facility tier, Title I |
| 4 | List row | which across many? | sortable attributes |
| 5 (highest) | Inspector | tell me everything | full dossier: identity, districts, all indicators + reasons + cites, trends, context |
| 5 (aligned) | Compare full-table | how do these few differ? | inspector-depth facts, aligned across sites, diff-marked |

Two altitude rules:

1. **Tooltips are altitude-2 previews, never a home for altitude-5 facts.** Per
   Carbon, a tooltip is supplementary and dismissible; anything a user needs to
   judge eligibility lives on the panel, not in a hover.
2. **Within a panel, lead with the highest-value answer.** For a site-scouting
   operator the decision is eligibility, so the inspector should open on Key
   indicators (the "may open here" verdict), then identity / districts / context —
   not bury the verdict below the address and four district rows. (Reorder pending.)

## Rollout status

- **Done (content):** `SchoolInspector` Key indicators (co-location, PLP, the
  eligibility callout) and Enrollment & capacity caveat; the PLP reason in
  `data/derive/plp.ts`.
- **Done (visual conformance):** `SchoolInspector`, `OverviewDock`, and
  `CompareView` font sizes snapped to the `TYPE` scale (no sub-12px, no
  off-scale half-steps, no 700 chrome weight); the inspector's ad-hoc greens /
  reds / Material blue replaced with `STATUS.good` / `STATUS.error` / `ACCENT`.
- **Next (same rules):** the inspector altitude reorder (Key indicators first);
  color-role conformance for `OverviewDock` (`SLATE`/`PLP_RED`/`CO_LOC_TEAL`
  locals) and `CompareView`; map hover tooltips, List column-header tooltips,
  the Compare "Full table" row help, filter-panel helper text, empty states.

No em dashes in `src` (the prose test); this doc lives at the repo root with the
other numbered specs, so it may use them.
