// Product app bar. Owns the identity, the view switcher, the search field
// (live Autocomplete), the info menu, and the user avatar. Responsive: on
// narrow screens the wordmark tagline hides and the search collapses; on
// mobile a menu button appears to open the filters drawer.

import { useEffect, useRef, useState, useMemo } from "react";
import {
  AppBar, Toolbar, Box, Chip, Avatar, Tooltip, Typography,
  ToggleButtonGroup, ToggleButton, IconButton, Menu, MenuItem, ListItemIcon,
  ListItemText, Divider, Autocomplete, TextField, Stack, Popover, useMediaQuery, useTheme,
} from "@mui/material";
import { Education as HubIcon, Search as SearchIcon, Map as MapIcon, List as ViewListIcon, Compare as CompareIcon, Information as InfoOutlinedIcon, Help as HelpOutlineIcon, Keyboard as KeyboardIcon, Menu as MenuIcon } from "@carbon/icons-react";
import { alpha } from "@mui/material/styles";
import { useData } from "../data/DataContext";
import { useStore, type ViewMode } from "../store";
import { panMapTo } from "../map/mapController";
import { SHELL_BG, SHELL_ON, SHELL_DIM, SHELL_HAIRLINE, TEAL } from "../muiTheme";
import { resolveGradeStyle, rgbaToCss } from "../map/gradeEncoding";
import type { SchoolFeature } from "../data/types";

export function TopNav({
  onOpenAttribution,
  onOpenMobileRail,
}: {
  onOpenAttribution: () => void;
  onOpenMobileRail?: () => void;
}) {
  const theme = useTheme();
  // One consistent phone breakpoint with App (< sm = 600): below it the filters
  // move into a drawer opened from the hamburger, and the inspector is a bottom
  // sheet. `compactSearch` is separate: the wide search field would overflow the
  // bar on tablets, so below md (900) it collapses to an icon that opens the same
  // search in a popover. Keeping these two thresholds distinct is what lets the
  // bar fit at every width without clipping the avatar.
  const isPhone = useMediaQuery(theme.breakpoints.down("sm"));
  const compactSearch = useMediaQuery(theme.breakpoints.down("md"));
  const { schools } = useData();
  const selectSchool = useStore((s) => s.selectSchool);
  const setMapView = useStore((s) => s.setMapView);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const compareCount = useStore((s) => s.comparePinnedMsids.length);
  const setCollapsed = useStore((s) => s.setPanelCollapsed);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [searchAnchor, setSearchAnchor] = useState<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        if (document.activeElement === inputRef.current) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const options: SchoolFeature[] = useMemo(() => schools?.features ?? [], [schools]);

  const goToSchool = (f: SchoolFeature) => {
    const [lng, lat] = f.geometry.coordinates as [number, number];
    if (viewMode !== "map") setViewMode("map");
    selectSchool(f.properties.msid);
    setMapView({ lat, lng }, 16);
    panMapTo({ lat, lng }, 16);
  };

  const openMobileRail = () => {
    setCollapsed(false);
    onOpenMobileRail?.();
  };

  // The search control, defined once and placed either inline in the bar (md+) or
  // inside a popover opened from a search icon (below md). Only one branch renders
  // at a time, so sizing keys off `compactSearch`: full width in the popover, a
  // fixed field in the bar.
  const searchAutocomplete = (
    <Autocomplete
      options={options}
      size="small"
      openOnFocus
      blurOnSelect
      clearOnBlur
      selectOnFocus
      disablePortal={false}
      value={null}
      open={searchOpen}
      onOpen={() => setSearchOpen(true)}
      onClose={() => setSearchOpen(false)}
      inputValue={searchInput}
      onInputChange={(_, v, reason) => {
        if (reason === "reset") return; // ignore MUI's post-select reset to the option label
        setSearchInput(v);
      }}
      sx={{ width: compactSearch ? "100%" : { md: 240, lg: 320 }, flex: "none" }}
      getOptionLabel={(o) => o.properties.name}
      isOptionEqualToValue={(a, b) => a.properties.msid === b.properties.msid}
      filterOptions={(opts, state) => {
        const q = state.inputValue.trim().toLowerCase();
        if (!q) return opts.slice(0, 12);
        return opts
          .filter((o) => o.properties.name.toLowerCase().includes(q) || o.properties.msid.toLowerCase().includes(q))
          .slice(0, 24);
      }}
      onChange={(_, value) => {
        if (!value) return;
        goToSchool(value);
        setSearchOpen(false);
        setSearchInput("");
        setSearchAnchor(null);
        inputRef.current?.blur();
      }}
      renderOption={(props, option) => {
        const { key, ...rest } = props as { key: string } & Record<string, unknown>;
        const gs = resolveGradeStyle(option.properties.current_grade);
        return (
          <Box component="li" key={key} {...rest} sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 1, px: 1.5 }}>
            <Box
              sx={{
                width: 26, height: 26, borderRadius: 0, flex: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 12,
                bgcolor: rgbaToCss(gs.fill), color: rgbaToCss(gs.letterColor),
                border: "1.25px solid",
                borderColor: rgbaToCss(gs.stroke),
                borderStyle: gs.dashed ? "dashed" : "solid",
              }}
            >
              {gs.letter}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: SHELL_ON, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {option.properties.name}
              </Typography>
              <Typography sx={{ fontSize: 11, color: SHELL_DIM }}>
                {option.properties.county}, {option.properties.level}, <Box component="span" sx={{ fontFamily: "var(--font-mono)" }}>{option.properties.msid}</Box>
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={inputRef}
          autoFocus={compactSearch}
          placeholder="Search school or MSID"
          variant="outlined"
          InputProps={{
            ...params.InputProps,
            startAdornment: (
              <SearchIcon size={18} style={{ color: SHELL_DIM, marginLeft: 4, marginRight: -4 }} />
            ),
            endAdornment: (
              <Box
                component="kbd"
                aria-hidden
                sx={{
                  display: { xs: "none", md: "inline-flex" },
                  alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 18, mr: 0.5, px: 0.5,
                  fontSize: 10, fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: SHELL_DIM, bgcolor: alpha(SHELL_ON, 0.06),
                  border: `1px solid ${SHELL_HAIRLINE}`, borderRadius: 0,
                }}
              >
                /
              </Box>
            ),
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 0, bgcolor: alpha(SHELL_ON, 0.04),
              transition: "background-color 120ms, box-shadow 120ms",
              "& fieldset": { borderColor: "transparent" },
              "&:hover fieldset": { borderColor: "transparent" },
              "&.Mui-focused": {
                bgcolor: "#FFFFFF",
                boxShadow: `inset 0 0 0 2px ${TEAL}`,
                "& fieldset": { borderColor: TEAL },
              },
            },
            "& .MuiOutlinedInput-input": { fontSize: 13, py: 0.5 },
          }}
        />
      )}
    />
  );

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{ bgcolor: SHELL_BG, color: SHELL_ON, borderBottom: `1px solid ${SHELL_HAIRLINE}` }}
    >
      <Toolbar variant="dense" sx={{ gap: { xs: 1, md: 2 }, minHeight: 60, px: { xs: 1.5, sm: 2, md: 3 } }}>
        {isPhone && (
          <IconButton edge="start" onClick={openMobileRail} sx={{ color: SHELL_ON, mr: 0.5 }} aria-label="Open filters">
            <MenuIcon size={20} />
          </IconButton>
        )}

        {/* Product identity */}
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flex: "none", mr: { xs: 0.5, md: 1 } }}>
          <Box
            sx={{
              width: 32, height: 32, borderRadius: 0, flex: "none",
              background: SHELL_ON,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 2px 4px ${alpha(SHELL_ON, 0.28)}`,
            }}
          >
            <HubIcon size={18} style={{ color: "#fff" }} />
          </Box>
          <Box sx={{ display: { xs: "none", sm: "block" } }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.1, color: SHELL_ON }}>
              Hope Siting
            </Typography>
            <Typography sx={{ fontSize: 11, color: SHELL_DIM, lineHeight: 1.2 }}>
              Schools of Hope, Florida
            </Typography>
          </Box>
        </Stack>

        <Tooltip
          title="School directory from NCES CCD (Common Core of Data), enrollment through 2024-2025. Letter grades wired from Florida DOE; building capacity from FISH (student stations)."
          placement="bottom"
        >
          <Chip
            size="small"
            label="Live, NCES CCD"
            variant="outlined"
            sx={{
              display: { xs: "none", lg: "inline-flex" },
              ml: 0.5, height: 22, color: SHELL_DIM,
              borderColor: SHELL_HAIRLINE, fontWeight: 500, cursor: "help",
            }}
          />
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {/* View switcher */}
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          size="small"
          onChange={(_, v: ViewMode | null) => v && setViewMode(v)}
          sx={{
            bgcolor: alpha(SHELL_ON, 0.04),
            borderRadius: 0,
            p: 0.375,
            "& .MuiToggleButton-root": {
              color: SHELL_DIM, border: "none",
              px: { xs: 1, sm: 1.5 }, py: 0.375,
              textTransform: "none", fontSize: 13, fontWeight: 600, gap: 0.5,
              borderRadius: "0 !important",
              "&.Mui-selected": { bgcolor: "#FFFFFF", color: SHELL_ON, boxShadow: "0 1px 2px rgba(15,23,42,0.08)" },
              "&.Mui-selected:hover": { bgcolor: "#FFFFFF" },
              "&:hover": { bgcolor: alpha(SHELL_ON, 0.06) },
            },
          }}
          aria-label="View mode"
        >
          <ToggleButton value="map" aria-label="Map view">
            <MapIcon size={16} />
            <Box sx={{ display: { xs: "none", sm: "inline" } }}>Map</Box>
          </ToggleButton>
          <ToggleButton value="list" aria-label="List view">
            <ViewListIcon size={16} />
            <Box sx={{ display: { xs: "none", sm: "inline" } }}>List</Box>
          </ToggleButton>
          <ToggleButton value="compare" aria-label={`Compare view${compareCount ? `, ${compareCount} pinned` : ""}`}>
            <CompareIcon size={16} />
            <Box sx={{ display: { xs: "none", sm: "inline" } }}>Compare</Box>
            {compareCount > 0 && (
              <Box
                component="span"
                aria-hidden
                sx={{
                  ml: 0.25, minWidth: 16, height: 16, px: 0.375,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, lineHeight: 1, borderRadius: 999,
                  fontVariantNumeric: "tabular-nums",
                  bgcolor: viewMode === "compare" ? TEAL : alpha(SHELL_ON, 0.14),
                  color: viewMode === "compare" ? "#FFFFFF" : SHELL_ON,
                }}
              >
                {compareCount}
              </Box>
            )}
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Search: full field on wide screens; below md it collapses to an icon
            that opens the same search in a popover, so the bar never overflows. */}
        {compactSearch ? (
          <>
            <Tooltip title="Search school or MSID">
              <IconButton
                aria-label="Search school or MSID"
                onClick={(e) => setSearchAnchor(e.currentTarget)}
                sx={{ color: SHELL_DIM }}
              >
                <SearchIcon size={18} />
              </IconButton>
            </Tooltip>
            <Popover
              open={Boolean(searchAnchor)}
              anchorEl={searchAnchor}
              onClose={() => setSearchAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{ paper: { sx: { p: 1, width: "min(360px, calc(100vw - 24px))", mt: 0.5 } } }}
            >
              {searchAutocomplete}
            </Popover>
          </>
        ) : (
          searchAutocomplete
        )}

        <Tooltip title="Info and attributions">
          <IconButton
            aria-label="Info menu"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={{ color: SHELL_DIM, display: { xs: "none", sm: "inline-flex" } }}
          >
            <HelpOutlineIcon size={16} />
          </IconButton>
        </Tooltip>
        <Menu
          open={Boolean(menuAnchor)}
          anchorEl={menuAnchor}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { minWidth: 260, mt: 1 } } }}
        >
          <MenuItem onClick={() => { setMenuAnchor(null); onOpenAttribution(); }}>
            <ListItemIcon><InfoOutlinedIcon size={16} /></ListItemIcon>
            <ListItemText primary="Data sources & accuracy" secondary="Every field: source, vintage, confidence" />
          </MenuItem>
          <MenuItem onClick={() => setMenuAnchor(null)}>
            <ListItemIcon><KeyboardIcon size={16} /></ListItemIcon>
            <ListItemText
              primary="Keyboard shortcuts"
              secondary={<>
                <Box component="span" sx={{ fontFamily: "var(--font-mono)" }}>/</Box> to search,{" "}
                <Box component="span" sx={{ fontFamily: "var(--font-mono)" }}>Esc</Box> to close inspector
              </>}
            />
          </MenuItem>
          <Divider />
          <MenuItem disabled sx={{ opacity: "1 !important" }}>
            <ListItemText
              primary={<Typography variant="caption" color="text.secondary">About</Typography>}
              secondary={
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                  Hope Siting maps Florida's Schools of Hope eligibility rule
                  (F.S. 1002.333) across Miami-Dade, Broward, and Orange counties.
                </Typography>
              }
            />
          </MenuItem>
        </Menu>

        <Tooltip title="avery.aden1@gmail.com">
          <Avatar sx={{ width: 32, height: 32, bgcolor: TEAL, fontSize: 13, fontWeight: 700 }}>A</Avatar>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
