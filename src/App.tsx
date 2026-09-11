// Composition root. Responsive three-column layout:
//   - Desktop/tablet: TopNav + LeftRail + main + inspector as columns
//   - Mobile (< md): LeftRail becomes a temporary MUI Drawer opened from the
//     app-bar menu button; the inspector becomes a bottom sheet.

import { Box, CircularProgress, Drawer, useMediaQuery, useTheme } from "@mui/material";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { MapErrorBoundary } from "./map/MapErrorBoundary";
import { Toolbar, MapToolButtons } from "./tools/Toolbar";

// The three views and the attribution sheet load on demand. The app shell (nav,
// rail, filters) paints immediately while the heavy map renderer (deck.gl) and
// the analytical views stream in behind a lightweight fallback, and a deploy that
// only touches one view re-downloads only that chunk.
const MapView = lazy(() => import("./map/MapView").then((m) => ({ default: m.MapView })));
const SchoolListView = lazy(() => import("./views/SchoolListView").then((m) => ({ default: m.SchoolListView })));
const AttributionStrip = lazy(() => import("./topbar/AttributionStrip").then((m) => ({ default: m.AttributionStrip })));
import { TopNav } from "./shell/TopNav";
import { LeftRail } from "./shell/LeftRail";
import { RightColumn } from "./shell/RightColumn";
import { OverviewDock } from "./status/OverviewDock";
import { ShortlistTray } from "./status/ShortlistTray";
import { ActiveFilterChips } from "./status/ActiveFilterChips";
import { MapLegend } from "./map/MapLegend";
import { MapLayersControl } from "./map/MapLayersControl";
import { MapQuickActions } from "./map/MapQuickActions";
import { useMapPersistence } from "./map/useMapPersistence";
import { OverflowDebug } from "./debug/OverflowDebug";
import { useStore } from "./store";
import { Bookmark as BookmarkIcon } from "@carbon/icons-react";

// The shortlist ("compare") opener lives ON THE MAP, in the top-right control
// cluster, so the app bar stays to the essentials (brand, search, view switch).
// It carries the pinned-site count and toggles the map's shortlist tray. Adding a
// site no longer auto-opens the tray; instead this button POPS and its counter
// ticks up, so the pick is acknowledged without hijacking the map.
function ShortlistMapButton() {
  const count = useStore((s) => s.comparePinnedMsids.length);
  const open = useStore((s) => s.shortlistOpen);
  const setOpen = useStore((s) => s.setShortlistOpen);
  const [pop, setPop] = useState(false);
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) {
      setPop(true);
      const t = setTimeout(() => setPop(false), 450);
      prev.current = count;
      return () => clearTimeout(t);
    }
    prev.current = count;
  }, [count]);
  return (
    <button
      type="button"
      className={`map-ctrl-btn map-shortlist-btn${open ? " map-ctrl-btn--active" : ""}${pop ? " map-shortlist-btn--pop" : ""}`}
      onClick={() => setOpen(!open)}
      aria-pressed={open}
      aria-label={count > 0 ? `Shortlist, ${count} site${count === 1 ? "" : "s"}` : "Shortlist, empty"}
      title={count > 0 ? "Review your shortlist" : "Pin sites to build a shortlist"}
    >
      <BookmarkIcon size={18} />
      {count > 0 && <span className="map-shortlist-badge">{count}</span>}
    </button>
  );
}

// The desktop inspector as a floating panel that SLIDES AWAY on close instead of
// vanishing. It stays mounted through a short slide-out whenever the selection
// clears (from the X, Escape, a click on the bare map, or opening the shortlist),
// so dismissing a card is a smooth motion. `overrideMsid` keeps the last school
// rendered during that animation. On the map it is a compact top-right companion
// card; on the list it is the full-height right column over a dimming scrim whose
// click dismisses it. Reduced motion unmounts at once.
function FloatingInspector() {
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  const selectSchool = useStore((s) => s.selectSchool);
  const viewMode = useStore((s) => s.viewMode);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [renderMsid, setRenderMsid] = useState<string | null>(selectedSchoolMsid);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (selectedSchoolMsid) { setRenderMsid(selectedSchoolMsid); setClosing(false); return; }
    if (!renderMsid) return;
    if (reduceMotion) { setRenderMsid(null); return; }
    setClosing(true);
    const t = setTimeout(() => { setClosing(false); setRenderMsid(null); }, 280);
    return () => clearTimeout(t);
  }, [selectedSchoolMsid, renderMsid, reduceMotion]);
  if (!renderMsid) return null;
  const onMap = viewMode === "map";
  const done = () => { setClosing(false); setRenderMsid(null); };
  return (
    <>
      {!onMap && (
        <Box
          className="inspector-scrim"
          onClick={() => selectSchool(null)}
          sx={{ position: "absolute", inset: 0, zIndex: 30, bgcolor: "rgba(15,23,42,0.32)", animation: "scrimFade 180ms ease-out" }}
        />
      )}
      <Box
        className={`insp-float${onMap ? " insp-float--map" : " insp-float--list"}${closing ? " insp-float--closing" : ""}`}
        onAnimationEnd={(e) => { if (e.target === e.currentTarget && closing) done(); }}
        sx={onMap
          ? { position: "absolute", top: 12, right: 64, zIndex: 31, maxWidth: "calc(100% - 76px)" }
          : { position: "absolute", top: 0, right: 0, height: "100%", zIndex: 31 }}
      >
        <RightColumn compact={onMap} overrideMsid={renderMsid} />
      </Box>
    </>
  );
}

// Shown in a view's place while its code chunk downloads. Deliberately quiet: a
// centered spinner on the app's own surface, so a lazy view never flashes a
// blank or a layout jump.
function ViewFallback() {
  return (
    <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "background.default" }}>
      <CircularProgress size={28} thickness={4} />
    </Box>
  );
}

export default function App() {
  useMapPersistence();
  const theme = useTheme();
  // The full-bleed dashboard layout (thin rail overlay + bottom dock + right
  // inspector column) applies from the "sm" breakpoint up; below that we fall
  // back to the drawer/bottom-sheet mobile layout.
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const viewMode = useStore((s) => s.viewMode);
  const selectSchool = useStore((s) => s.selectSchool);
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  const panelCollapsed = useStore((s) => s.panelCollapsed);
  const setPanelCollapsed = useStore((s) => s.setPanelCollapsed);
  const [attributionOpen, setAttributionOpen] = useState(false);
  // Lifted to the store so the results sheet's Filters entry can open it too.
  const mobileRailOpen = useStore((s) => s.mobileRailOpen);
  const setMobileRailOpen = useStore((s) => s.setMobileRailOpen);

  // Escape: exit an active map tool first, then close the inspector, then the
  // expanded filter panel. One key, unwinding the most transient state first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useStore.getState();
      if (s.activeTool !== "none") s.setTool("none");
      else if (s.selectedSchoolMsid) selectSchool(null);
      else if (!s.panelCollapsed) s.setPanelCollapsed(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectSchool]);

  // The map surface plus every overlay that anchors to it. The OverviewDock along
  // the bottom is a compact "schools in view" browser (glance and fly-to); it
  // hands off to the full List table for sorting, searching, comparing and export.
  const mapBlock = (
    <>
      <MapErrorBoundary>
        <Suspense fallback={<ViewFallback />}>
          <MapView />
        </Suspense>
      </MapErrorBoundary>
      {/* Phone-only Search + Filters, moved off the app bar onto the map. */}
      <MapQuickActions />
      <ActiveFilterChips />
      {/* Top-right control cluster: legend + base map as two icon buttons in one
          shared card (a hairline between them), mirroring the bottom-right zoom
          group so the map's chrome reads as one consistent system. */}
      <div className="map-topright">
        <div className="map-controls-group">
          <ShortlistMapButton />
        </div>
        <div className="map-controls-group">
          <MapLegend />
          <span className="map-ctrl-sep" aria-hidden />
          <MapLayersControl />
          <span className="map-ctrl-sep" aria-hidden />
          <MapToolButtons />
        </div>
      </div>
      <Toolbar />
      <OverviewDock />
      <ShortlistTray />
      {attributionOpen && (
        <Suspense fallback={null}>
          <AttributionStrip open onClose={() => setAttributionOpen(false)} />
        </Suspense>
      )}
    </>
  );

  let mainSurface;
  if (viewMode === "list") {
    mainSurface = (
      <Box sx={{ flex: 1, position: "relative", minWidth: 0 }}>
        <Suspense fallback={<ViewFallback />}>
          <SchoolListView />
        </Suspense>
      </Box>
    );
  } else {
    mainSurface = (
      <Box sx={{ flex: 1, position: "relative", minWidth: 0 }}>
        {mapBlock}
      </Box>
    );
  }

  // overflow: clip (not hidden) so the shell is not a scroll container at all: a
  // programmatic scrollIntoView (from the list, say) can never drag the whole app
  // sideways when a child like the app bar overflows at a narrow width.
  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "clip" }}>
      <OverflowDebug />
      <TopNav onOpenAttribution={() => setAttributionOpen(true)} />
      <Box sx={{ flex: 1, display: "flex", minHeight: 0, position: "relative", pl: { sm: "64px" } }}>
        {/* Desktop rail: a thin icon rail that OVERLAYS the map when expanded
            (rather than pushing it), matching the full-bleed dashboard layout.
            The 56px left padding above reserves room for the collapsed rail.
            A transparent scrim closes the expanded panel on any outside click
            (race-free, unlike ClickAwayListener wrapping the toggle). */}
        {!isMobile && !panelCollapsed && (
          <Box onClick={() => setPanelCollapsed(true)} sx={{ position: "absolute", inset: 0, zIndex: 15 }} />
        )}
        {!isMobile && (
          <Box sx={{ position: "absolute", top: 0, left: 0, height: "100%", zIndex: 20, display: "flex", boxShadow: panelCollapsed ? "none" : "8px 0 24px rgba(15,23,42,0.10)" }}>
            <LeftRail onOpenAttribution={() => setAttributionOpen(true)} />
          </Box>
        )}

        {/* Mobile rail: temporary drawer */}
        {isMobile && (
          <Drawer
            anchor="left"
            open={mobileRailOpen}
            onClose={() => setMobileRailOpen(false)}
            ModalProps={{ keepMounted: true }}
            slotProps={{ paper: { sx: { width: 320 } } }}
          >
            <LeftRail onNavigate={() => setMobileRailOpen(false)} />
          </Drawer>
        )}

        {mainSurface}

        {/* Desktop inspector: a floating overlay, never a flex sibling (a
            fixed-width column pushed the main surface and compressed the list and
            compare matrix into an illegible sliver). It floats above the content
            at full height with a shadow, so every view keeps its full width
            underneath.

            The scrim is context-aware, which is how we thread the needle. Over
            the List view the background is a static grid you have
            stepped away from to read one detail, so a dimming scrim focuses the
            panel and a click on it closes the inspector. Over the Map the
            background is live spatial context you want to keep seeing and
            clicking, so there is no scrim: the map stays bright and fully
            interactive (pan, and click another pin to swap the inspector), and
            the panel reads as a companion card, like a Google Maps place card.
            The selected school is fly-to centered, so it sits clear of the
            right-edge panel. Close from the map is the X button or Escape. */}
        {!isMobile && <FloatingInspector />}

        {/* Mobile inspector: bottom sheet, only when a school is selected */}
        {isMobile && (
          <Drawer
            anchor="bottom"
            open={Boolean(selectedSchoolMsid)}
            onClose={() => selectSchool(null)}
            slotProps={{ paper: { sx: { height: "80dvh", borderTopLeftRadius: 20, borderTopRightRadius: 20 } } }}
          >
            <RightColumn />
          </Drawer>
        )}
      </Box>
    </Box>
  );
}
