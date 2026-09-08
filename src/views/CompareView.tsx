// Compare view: a side-by-side matrix of 2 to 4 pinned sites, promoted to a
// first-class view alongside Map and List. Columns are sites, rows are
// attributes, grouped into labelled sections in decision order. The design
// follows the researched comparison-table canon (NN/g, Baymard, Best Buy):
//
//   - Canonical orientation: sites across the top, attributes down the left, so
//     a single attribute scans across every site in one horizontal sweep.
//   - Sticky identity header (grade, name, flags) and a sticky row-label column,
//     so you never lose which site a value belongs to or which row you are on.
//   - "Differences only" hides rows where every site shares a value, the fastest
//     way to see what actually separates the sites; differing rows are always
//     marked (a neutral dot and a heavier value), never ranked.
//   - Attributes grouped into sections, never an alphabetical wall.
//   - A guided empty state that teaches the feature and lets you build the set,
//     so the view is useful the moment you land on it with nothing pinned.
//
// No site is ranked and no aggregate score is shown: the tool lays out the facts
// and the analyst forms the judgment. Every value comes from the always-available
// spatial indexes (see compareModel), so a fact is populated here regardless of
// which map overlays are toggled on.

import { Fragment, useMemo, useState } from "react";
import {
  Box, Paper, IconButton, Typography, Chip, Button, Stack, Tooltip, Switch,
  FormControlLabel, Autocomplete, TextField, Table, TableHead, TableBody,
  TableRow, TableCell, TableContainer,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Close as CloseIcon, Compare as CompareIcon, Add as AddIcon } from "@carbon/icons-react";
import { useData } from "../data/DataContext";
import { useStore, MAX_COMPARE } from "../store";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import { ExportButton } from "../tools/ExportButton";
import { SHELL_ON, SHELL_DIM, SHELL_BG, SHELL_HAIRLINE, TEAL, ACCENT_TEXT, RADIUS } from "../muiTheme";
import { buildCompareSections } from "./compareModel";
import type { SchoolFeature } from "../data/types";

const RED_STRONG = "#B71C1C";
const GREEN_MID = "#047857";

// The sticky row-label column is a hair wider than a normal cell so full labels
// ("Utilization (enrollment / capacity)") read without truncation.
const LABEL_COL = 260;
const SITE_COL_MIN = 210;

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
  const addable = useMemo(
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
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, bgcolor: "background.default" }}>
      {/* Toolbar: identity, the neutrality note, and the row of controls. */}
      <Box
        sx={{
          flex: "none", px: 2.5, py: 1.5, borderBottom: `1px solid ${SHELL_HAIRLINE}`,
          bgcolor: "background.paper", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 2, flexWrap: "wrap", rowGap: 1.25,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CompareIcon size={18} style={{ color: TEAL }} />
            <Typography sx={{ fontSize: 16, fontWeight: 600, color: SHELL_ON }}>
              Comparing {schools.length} sites
            </Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: SHELL_DIM, fontVariantNumeric: "tabular-nums" }}>
              of {MAX_COMPARE}
            </Typography>
          </Stack>
          <Typography sx={{ fontSize: 12, color: SHELL_DIM, display: { xs: "none", md: "block" } }}>
            No site is ranked. A dot marks rows where the sites differ.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
          {canAdd && (
            <Autocomplete
              size="small"
              options={addable}
              getOptionLabel={(o) => o.label}
              onChange={(_, v) => { if (v) toggleComparePin(v.msid); }}
              value={null}
              blurOnSelect
              clearOnBlur
              renderInput={(params) => <TextField {...params} placeholder="Add a site" />}
              ListboxProps={{ style: { fontSize: 13 } }}
              sx={{ width: 210, "& .MuiInputBase-root": { fontSize: 13 } }}
            />
          )}
          <FormControlLabel
            control={<Switch size="small" checked={differencesOnly} onChange={(_, v) => setDifferencesOnly(v)} />}
            label={<Typography sx={{ fontSize: 12, fontWeight: 600, color: SHELL_ON }}>Differences only</Typography>}
            sx={{ mr: 0.5 }}
          />
          <ExportButton filenameBase="compare" headers={headers} rows={exportRows} label="Export" />
          <Button size="small" onClick={clearCompare} sx={{ color: SHELL_DIM, textTransform: "none", fontWeight: 600 }}>
            Clear
          </Button>
        </Stack>
      </Box>

      {/* The matrix. A single scroll container so the sticky header and sticky
          label column pin against the same viewport; site columns scroll under a
          fixed identity row when the window is too narrow to fit all four. */}
      <TableContainer sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {noDifferences ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <Typography sx={{ color: SHELL_DIM, fontSize: 13 }}>
              These sites match on every compared field. Turn off &quot;Differences only&quot; to see the full comparison.
            </Typography>
          </Box>
        ) : (
          <Table
            stickyHeader
            size="small"
            sx={{
              tableLayout: "fixed",
              width: schools.length >= 4 ? "100%" : "auto",
              minWidth: LABEL_COL + schools.length * SITE_COL_MIN,
              borderCollapse: "separate",
              borderSpacing: 0,
            }}
          >
            <TableHead>
              <TableRow>
                {/* Corner cell: sticky in both axes so it never lets a column or
                    row header slide under it. */}
                <TableCell
                  sx={{
                    position: "sticky", left: 0, top: 0, zIndex: 4,
                    width: { xs: 172, sm: LABEL_COL }, minWidth: { xs: 172, sm: LABEL_COL },
                    bgcolor: SHELL_BG, borderBottom: `1px solid ${SHELL_HAIRLINE}`,
                    borderRight: `1px solid ${SHELL_HAIRLINE}`, verticalAlign: "bottom",
                  }}
                >
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: SHELL_DIM, letterSpacing: 0.16 }}>
                    Field
                  </Typography>
                </TableCell>
                {schools.map((s) => (
                  <SiteHeaderCell
                    key={s.properties.msid}
                    school={s}
                    minWidth={SITE_COL_MIN}
                    isSoh={ctx.sohEligibleMsids.has(s.properties.msid)}
                    isPlp={ctx.plp.has(s.properties.msid)}
                    onOpen={() => selectSchool(s.properties.msid)}
                    onRemove={() => toggleComparePin(s.properties.msid)}
                  />
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleSections.map((sec) => (
                <Fragment key={sec.title}>
                  <TableRow>
                    <TableCell
                      colSpan={totalCols}
                      sx={{
                        position: "sticky", left: 0, zIndex: 1,
                        bgcolor: alpha(SHELL_ON, 0.035),
                        borderBottom: `1px solid ${SHELL_HAIRLINE}`,
                        py: 0.75,
                      }}
                    >
                      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.32, color: SHELL_DIM, textTransform: "uppercase" }}>
                        {sec.title}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  {sec.rows.map((r) => (
                    <TableRow
                      key={r.key}
                      sx={{ "&:hover .compare-value, &:hover .compare-label": { bgcolor: alpha(TEAL, 0.04) } }}
                    >
                      {/* Row label: sticky left, with a neutral diff dot. */}
                      <TableCell
                        className="compare-label"
                        sx={{
                          position: "sticky", left: 0, zIndex: 1,
                          width: { xs: 172, sm: LABEL_COL }, minWidth: { xs: 172, sm: LABEL_COL },
                          bgcolor: SHELL_BG, borderRight: `1px solid ${SHELL_HAIRLINE}`,
                          borderBottom: `1px solid ${SHELL_HAIRLINE}`,
                          verticalAlign: "top", py: 1,
                        }}
                      >
                        <Stack direction="row" spacing={0.75} alignItems="flex-start">
                          <Box
                            aria-hidden
                            sx={{
                              width: 6, height: 6, borderRadius: "50%", mt: 0.7, flex: "none",
                              bgcolor: r.diff ? TEAL : "transparent",
                            }}
                          />
                          <Tooltip title={r.help ?? ""} placement="right" arrow disableHoverListener={!r.help}>
                            <Typography
                              component="span"
                              sx={{ fontSize: 12.5, color: SHELL_DIM, lineHeight: 1.35, cursor: r.help ? "help" : "default", borderBottom: r.help ? `1px dotted ${SHELL_HAIRLINE}` : "none" }}
                            >
                              {r.label}
                            </Typography>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      {r.values.map((v, i) => (
                        <TableCell
                          key={schools[i].properties.msid}
                          className="compare-value"
                          sx={{
                            minWidth: SITE_COL_MIN, verticalAlign: "top", py: 1,
                            borderBottom: `1px solid ${SHELL_HAIRLINE}`,
                            bgcolor: r.diff ? alpha(TEAL, 0.02) : "transparent",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 13, lineHeight: 1.35, color: SHELL_ON,
                              fontWeight: r.diff ? 600 : 400,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {v}
                          </Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </Box>
  );
}

// One site's identity header: grade badge, name (opens the inspector), county,
// eligibility pills, and a remove control. Sticky top via the table's
// stickyHeader; a bottom border keeps it legible over the scrolling rows.
function SiteHeaderCell({ school, minWidth, isSoh, isPlp, onOpen, onRemove }: {
  school: SchoolFeature; minWidth: number; isSoh: boolean; isPlp: boolean;
  onOpen: () => void; onRemove: () => void;
}) {
  const p = school.properties;
  const gs = resolveGradeStyle(p.current_grade);
  return (
    <TableCell
      sx={{
        top: 0, minWidth, verticalAlign: "top", bgcolor: SHELL_BG,
        borderBottom: `1px solid ${SHELL_HAIRLINE}`, py: 1.25,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box
          title={gs.description}
          sx={{
            width: 30, height: 30, borderRadius: RADIUS.sm, flex: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 14,
            bgcolor: rgbaToCss(gs.fill), color: rgbaToCss(gs.letterColor),
            border: "1.25px solid", borderColor: rgbaToCss(gs.stroke),
            borderStyle: gs.dashed ? "dashed" : "solid",
          }}
        >
          {gs.letter}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Tooltip title="Open in the details panel">
            <Button
              onClick={onOpen}
              sx={{ p: 0, minWidth: 0, textTransform: "none", fontWeight: 600, color: SHELL_ON, fontSize: 13, lineHeight: 1.25, textAlign: "left", justifyContent: "flex-start", display: "block", "&:hover": { color: ACCENT_TEXT, bgcolor: "transparent" } }}
            >
              {p.name}
            </Button>
          </Tooltip>
          <Typography sx={{ fontSize: 11, color: SHELL_DIM, mt: 0.25 }}>{p.county}</Typography>
          {(isSoh || isPlp) && (
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
              {isSoh && <HeaderPill label="SoH eligible" color={GREEN_MID} />}
              {isPlp && <HeaderPill label="PLP" color={RED_STRONG} />}
            </Stack>
          )}
        </Box>
        <IconButton size="small" aria-label={`Remove ${p.name} from compare`} onClick={onRemove} sx={{ color: SHELL_DIM, mt: -0.5, mr: -0.5, flex: "none" }}>
          <CloseIcon size={16} />
        </IconButton>
      </Stack>
    </TableCell>
  );
}

// Guided empty / building state, shown at 0 or 1 pinned sites. Teaches what the
// view does and lets the analyst assemble the set right here, so the view is
// never a dead end.
function CompareEmptyState({ pinned, addable, onAdd, onRemove }: {
  pinned: SchoolFeature[];
  addable: Array<{ msid: string; label: string }>;
  onAdd: (msid: string) => void;
  onRemove: (msid: string) => void;
}) {
  return (
    <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", p: 3, bgcolor: "background.default", overflow: "auto" }}>
      <Paper variant="outlined" sx={{ maxWidth: 560, width: "100%", p: { xs: 3, sm: 4 }, borderColor: SHELL_HAIRLINE }}>
        <Stack spacing={2.5} alignItems="center" textAlign="center">
          <Box sx={{ width: 52, height: 52, borderRadius: RADIUS.md, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(TEAL, 0.1) }}>
            <CompareIcon size={26} style={{ color: TEAL }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 18, fontWeight: 600, color: SHELL_ON }}>
              Compare sites side by side
            </Typography>
            <Typography sx={{ fontSize: 13.5, color: SHELL_DIM, mt: 1, lineHeight: 1.5 }}>
              Pin 2 to {MAX_COMPARE} schools to line up their grades, eligibility, capacity,
              districts, and community context row by row. No site is ranked; you
              read the facts and decide.
            </Typography>
          </Box>

          {/* Currently pinned (0 or 1), each removable. */}
          {pinned.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", justifyContent: "center", rowGap: 1 }}>
              {pinned.map((s) => (
                <Chip
                  key={s.properties.msid}
                  label={s.properties.name}
                  onDelete={() => onRemove(s.properties.msid)}
                  sx={{ bgcolor: alpha(TEAL, 0.1), color: ACCENT_TEXT, fontWeight: 600 }}
                />
              ))}
            </Stack>
          )}

          <Box sx={{ width: "100%", maxWidth: 340 }}>
            <Autocomplete
              size="small"
              options={addable}
              getOptionLabel={(o) => o.label}
              onChange={(_, v) => { if (v) onAdd(v.msid); }}
              value={null}
              blurOnSelect
              clearOnBlur
              renderInput={(params) => (
                <TextField
                  {...params}
                  autoFocus
                  placeholder={pinned.length === 0 ? "Add the first site" : "Add one more site"}
                  InputProps={{ ...params.InputProps, startAdornment: <AddIcon size={16} style={{ color: SHELL_DIM, marginLeft: 4, marginRight: 2 }} /> }}
                />
              )}
              ListboxProps={{ style: { fontSize: 13 } }}
              sx={{ "& .MuiInputBase-root": { fontSize: 13 } }}
            />
          </Box>

          <Typography sx={{ fontSize: 12, color: SHELL_DIM, lineHeight: 1.5 }}>
            You can also pin schools from the compare control in the List view or
            from a school&apos;s details panel. Pinned sites are kept in the page link.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

function HeaderPill({ label, color }: { label: string; color: string }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 18, fontSize: 10, fontWeight: 700,
        bgcolor: alpha(color, 0.1), color, border: `1px solid ${alpha(color, 0.35)}`,
        "& .MuiChip-label": { px: 0.75 },
      }}
    />
  );
}
