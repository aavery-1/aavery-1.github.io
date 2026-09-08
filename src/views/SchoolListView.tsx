// Full-screen List view: the analytical surface. Honors the same filters as the
// map (county, grade, utilization) so both views always show the same universe.
// A scope control chooses between every filtered school and only those in the
// current map bounds, the set the map's "schools in view" dock hands off. Clicking
// a row opens the inspector; the per-row "Show on map" action jumps back to the
// map. The table itself lives in SchoolTable, shared with the map dock's data.

import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useStore } from "../store";
import { useFilteredSchools } from "../data/derive/useFilteredSchools";
import { SchoolTable } from "./SchoolTable";
import { TEAL, ACCENT_TEXT, SHELL_ON, SHELL_DIM, SHELL_HAIRLINE } from "../muiTheme";

export function SchoolListView() {
  const listScope = useStore((s) => s.listScope);
  const setListScope = useStore((s) => s.setListScope);
  const { total, inViewTotal } = useFilteredSchools();

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Scope bar: which set of schools the table shows. Distinct from the
          table's own search, which narrows within the chosen set. */}
      <Box
        sx={{
          flex: "none", px: 2.5, py: 1.25, borderBottom: `1px solid ${SHELL_HAIRLINE}`,
          bgcolor: "background.paper", display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", rowGap: 1,
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: SHELL_DIM, textTransform: "none", letterSpacing: 0.16 }}>
          Show
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={listScope}
          onChange={(_, v) => { if (v) setListScope(v); }}
          aria-label="School scope"
          sx={{
            "& .MuiToggleButton-root": {
              textTransform: "none", fontSize: 13, fontWeight: 600, px: 1.5, py: 0.375, color: SHELL_DIM,
              border: `1px solid ${SHELL_HAIRLINE}`,
              "&.Mui-selected": { bgcolor: alpha(TEAL, 0.14), color: ACCENT_TEXT, "&:hover": { bgcolor: alpha(TEAL, 0.2) } },
            },
          }}
        >
          <ToggleButton value="all" aria-label="All filtered schools">
            All schools
            <Count value={total} active={listScope === "all"} />
          </ToggleButton>
          <ToggleButton value="inView" aria-label="Schools in the current map view">
            In map view
            <Count value={inViewTotal} active={listScope === "inView"} />
          </ToggleButton>
        </ToggleButtonGroup>
        {listScope === "inView" && (
          <Typography sx={{ fontSize: 12, color: SHELL_DIM, lineHeight: 1.4 }}>
            Limited to the area last shown on the map. Switch to Map view to pan or zoom.
          </Typography>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <SchoolTable scope={listScope} />
      </Box>
    </Box>
  );
}

function Count({ value, active }: { value: number; active: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        ml: 0.75, fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: active ? ACCENT_TEXT : SHELL_ON,
      }}
    >
      {value.toLocaleString("en-US")}
    </Box>
  );
}
