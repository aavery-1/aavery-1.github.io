// Active-filter breadcrumb strip that hovers at the top of the map. Renders only
// non-default filters, each as a chip with an x that clears just that filter.
// When nothing is filtered the strip renders nothing. Reads the shared
// useActiveFilters() list (same source the panel's applied-filters summary uses),
// so the two always mirror the real filter state.

import { Box, Chip, Paper, Typography, Stack, Divider } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useStore } from "../store";
import { useActiveFilters } from "./useActiveFilters";
import { TEAL, ACCENT_TEXT, RADIUS } from "../muiTheme";

export function ActiveFilterChips() {
  const filters = useActiveFilters();
  const resetAll = useStore((s) => s.resetAll);

  if (filters.length === 0) return null;

  return (
    <Paper
      role="status"
      aria-label="Active filters"
      elevation={3}
      sx={{
        position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
        zIndex: 8, display: "flex", alignItems: "center", gap: 1,
        maxWidth: { xs: "calc(100% - 24px)", md: "calc(100% - 220px)" },
        overflowX: "auto", bgcolor: "#FFFFFF", border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: RADIUS.full, px: 1.5, py: 0.75,
      }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", letterSpacing: 0.16, textTransform: "none", pl: 0.25, flex: "none" }}>
        Active
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flex: "none" }}>
        {filters.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            size="small"
            onDelete={f.onClear}
            deleteIcon={<Box sx={{ fontSize: 14, lineHeight: 1, color: "inherit", cursor: "pointer", pr: 0.25 }}>×</Box>}
            sx={{
              height: 28, fontSize: 13, fontWeight: 600, px: 0.25,
              color: f.section === "Geography" ? "#5B21B6" : ACCENT_TEXT,
              bgcolor: f.section === "Geography" ? alpha("#7E57C2", 0.12) : alpha(TEAL, 0.12),
              border: `1px solid ${f.section === "Geography" ? alpha("#7E57C2", 0.35) : alpha(TEAL, 0.35)}`,
              "& .MuiChip-label": { px: 1.25 },
              "& .MuiChip-deleteIcon": { color: "inherit", opacity: 0.7, "&:hover": { opacity: 1 } },
            }}
          />
        ))}
      </Stack>
      {filters.length > 1 && (
        <>
          <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
          <Box
            component="button"
            onClick={resetAll}
            sx={{
              flex: "none", background: "none", border: "none", cursor: "pointer",
              color: TEAL, fontSize: 12, fontWeight: 700, textTransform: "none", letterSpacing: 0.16,
              px: 0.75, py: 0.5, borderRadius: RADIUS.full, "&:hover": { bgcolor: alpha(TEAL, 0.08) },
            }}
          >
            Clear all
          </Box>
        </>
      )}
    </Paper>
  );
}
