// Google Maps hybrid base with a deck.gl GoogleMapsOverlay for all data layers
// (never Google's native data layer, which bogs down with many toggled
// polygons). Owns the map furniture that needs live map state: scale bar and
// coordinate readout. Handles the missing-key, auth-error, and network-error
// states with specific messages instead of a blank page.

import { useEffect, useRef, useState, useCallback } from "react";
import { GoogleMapsOverlay } from "@deck.gl/google-maps";
import { useGoogleMaps } from "./useGoogleMaps";
import { useDeckLayers, type SchoolHoverInfo, type SohHoverInfo } from "./useDeckLayers";
import { resolveGradeStyle, rgbaToCss } from "./gradeEncoding";
import { useData } from "../data/DataContext";
import { schoolTypeLabel } from "../data/types";
import { StarFilled } from "@carbon/icons-react";
import { useStore, type LatLng, type BaseMapType } from "../store";
import { PILOT_MIN_ZOOM } from "../geo/countyBounds";
import { basemapStyleFor } from "./mapStyles";

// Our base type names map to Google's mapTypeIds. "satellite" uses hybrid so the
// imagery keeps its place and street labels.
function googleMapTypeId(type: BaseMapType): string {
  if (type === "satellite") return "hybrid";
  if (type === "terrain") return "terrain";
  return "roadmap";
}
import { ScaleBar } from "./ScaleBar";
import { CoordReadout } from "./CoordReadout";
import { MapControls } from "./MapControls";
import { MissingKeyNotice } from "./MissingKeyNotice";
import { registerMap, flyToSchool } from "./mapController";

export function MapView() {
  const { status } = useGoogleMaps();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mouse, setMouse] = useState<LatLng | null>(null);
  const [hover, setHover] = useState<SchoolHoverInfo | null>(null);
  const [sohHover, setSohHover] = useState<SohHoverInfo | null>(null);

  // The school tooltip is interactive (its PLP anchor is a link), so leaving the
  // marker must not hide it instantly: the cursor has to cross a small gap of bare
  // map to reach it. A short grace timer bridges that gap, and hovering the
  // tooltip itself cancels the pending hide. Moving to another marker (a non-null
  // hover) or leaving the tooltip clears it at once.
  const hideTimer = useRef<number | null>(null);
  const cancelHide = useCallback(() => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);
  const onSchoolHover = useCallback((info: SchoolHoverInfo | null) => {
    cancelHide();
    if (info) setHover(info);
    else hideTimer.current = window.setTimeout(() => setHover(null), 160);
  }, [cancelHide]);
  const onSohHover = useCallback((info: SohHoverInfo | null) => setSohHover(info), []);
  const layers = useDeckLayers(onSchoolHover, onSohHover);
  const { schools } = useData();

  const zoomBy = useCallback((delta: number) => {
    const m = mapRef.current;
    if (!m) return;
    const z = m.getZoom();
    if (typeof z === "number") m.setZoom(z + delta);
  }, []);

  // Frame every currently loaded school. Reused by the first-load fit and the
  // reset control. Padding clears the bottom dock and the left filter rail.
  const fitToSchools = useCallback(() => {
    const m = mapRef.current;
    if (!m || !schools?.features.length) return;
    const bounds = new google.maps.LatLngBounds();
    for (const f of schools.features) {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      bounds.extend({ lat, lng });
    }
    // Padding only clears the chrome that actually overlays the map on load:
    // the header breathing room (top), the left rail (left), the zoom/tool
    // controls (right), and the COLLAPSED overview dock (~42px) plus a margin
    // (bottom). Reserving the expanded-dock height here (was 260) shoved every
    // school up and to the right, leaving the fit off-center over open water.
    m.fitBounds(bounds, { top: 72, right: 56, bottom: 96, left: 80 });
  }, [schools]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void rootRef.current?.requestFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const didInitialFit = useRef(false);
  const baseMapType = useStore((s) => s.baseMapType);
  const overlays = useStore((s) => s.overlays);
  const setMapView = useStore((s) => s.setMapView);
  const setMapBounds = useStore((s) => s.setMapBounds);
  const trafficRef = useRef<google.maps.TrafficLayer | null>(null);
  const transitRef = useRef<google.maps.TransitLayer | null>(null);
  const bicyclingRef = useRef<google.maps.BicyclingLayer | null>(null);
  const addMeasurePoint = useStore((s) => s.addMeasurePoint);
  const setRadius = useStore((s) => s.setRadius);
  const activeTool = useStore((s) => s.activeTool);
  const selectedSchoolMsid = useStore((s) => s.selectedSchoolMsid);
  const initialCenter = useStore.getState().mapCenter;
  const initialZoom = useStore.getState().mapZoom;

  // Initialize the map once the script is ready.
  useEffect(() => {
    if (status !== "ready" || !mapEl.current || mapRef.current) return;
    const map = new google.maps.Map(mapEl.current, {
      center: initialCenter,
      zoom: initialZoom,
      mapTypeId: googleMapTypeId(baseMapType),
      styles: basemapStyleFor(baseMapType),
      tilt: 0,
      clickableIcons: false,
      disableDefaultUI: true,
      zoomControl: false,
      gestureHandling: "greedy",
      keyboardShortcuts: true,
      // Floor on zoom-out so the map never recedes below the tri-county overview
      // into empty basemap where no layer has data (see countyBounds.ts). No
      // lat/lng restriction: the three counties are too far apart for a bounds
      // box to coexist with the all-three overview.
      minZoom: PILOT_MIN_ZOOM,
    });
    mapRef.current = map;
    registerMap(map);

    const overlay = new GoogleMapsOverlay({ layers: [] });
    overlay.setMap(map);
    overlayRef.current = overlay;
    // Signal that the overlay exists so the layer-push effect runs now that
    // there is somewhere to push to. Without this, layers computed BEFORE the
    // map became ready would never reach the overlay (the push effect only
    // re-runs when `layers` changes), and no pins would render on first load.
    setOverlayReady(true);

    // The deck.gl 9.x GoogleMapsOverlay reads its canvas dimensions when the
    // map fires idle/bounds_changed. When the map container resizes without
    // the camera moving (inspector opens or closes, drawer toggles, DPR
    // changes), deck's projection stays stuck on the previous viewport size
    // and pins render at the wrong pixel positions. Watching the map div
    // with ResizeObserver and nudging the camera by one pixel forces
    // bounds_changed to fire so deck re-projects. The pan is reversed
    // immediately so the visible camera does not move.
    let ro: ResizeObserver | null = null;
    let kickTimer: ReturnType<typeof setTimeout> | null = null;
    if (mapEl.current) {
      const kick = () => {
        google.maps.event.trigger(map, "resize");
        map.panBy(1, 0);
        map.panBy(-1, 0);
      };
      ro = new ResizeObserver(kick);
      ro.observe(mapEl.current);
      kickTimer = setTimeout(kick, 500);
    }

    const syncView = () => {
      const c = map.getCenter();
      const z = map.getZoom();
      if (c && typeof z === "number") setMapView({ lat: c.lat(), lng: c.lng() }, z);
      const b = map.getBounds();
      if (b) {
        const ne = b.getNorthEast();
        const sw = b.getSouthWest();
        // Ignore degenerate bounds. When the view switches to List the map
        // container collapses to zero size and fires a final "idle" with a
        // near-empty box; writing that would blank the "In map view" scope. A
        // real map always has north > south, so this keeps the last good bounds.
        if (ne.lat() > sw.lat() && ne.lng() !== sw.lng()) {
          setMapBounds({ north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() });
        }
      }
    };
    map.addListener("idle", syncView);

    map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) setMouse({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      const tool = useStore.getState().activeTool;
      if (tool === "measure") addMeasurePoint(p);
      else if (tool === "radius") setRadius(p);
    });

    // Tear down fully. Without this, React 18 StrictMode's dev-only double
    // effect-invocation (mount, cleanup, mount again) leaves the first
    // GoogleMapsOverlay's luma.gl device alive while a second one spins up,
    // which corrupts deck's shared shader-module registry ("luma.gl: this
    // version has already been initialized", then shader link errors on
    // every icon/text layer). A real unmount (view switch, HMR) hits the same
    // path, so this also fixes leaking a live overlay + WebGL context there.
    return () => {
      if (ro) ro.disconnect();
      if (kickTimer !== null) clearTimeout(kickTimer);
      google.maps.event.clearInstanceListeners(map);
      overlay.finalize();
      overlayRef.current = null;
      mapRef.current = null;
      setOverlayReady(false);
      registerMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Push deck layers to the overlay whenever they change OR once the overlay
  // first becomes available (overlayReady flips false->true after map init).
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.setProps({ layers });
  }, [layers, overlayReady]);

  // Switch the base imagery: road map, satellite (hybrid, with labels), terrain.
  // Re-apply the muted style on every switch so the decluttered basemap holds
  // across base types.
  useEffect(() => {
    mapRef.current?.setOptions({
      mapTypeId: googleMapTypeId(baseMapType),
      styles: basemapStyleFor(baseMapType),
    });
  }, [baseMapType]);

  // Selecting a school (from a pin, the dock, the list, or search) smoothly flies
  // the map to it. One place owns the animation so every entry point behaves the
  // same. Skipped while a map tool is active so a measure/radius click that also
  // selects does not yank the view.
  useEffect(() => {
    if (!selectedSchoolMsid || !mapRef.current || !schools) return;
    if (useStore.getState().activeTool !== "none") return;
    const f = schools.features.find((x) => x.properties.msid === selectedSchoolMsid);
    if (!f) return;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    flyToSchool({ lat, lng }, 15);
  }, [selectedSchoolMsid, schools]);

  // A crosshair cursor makes measurement/radius mode unmistakable.
  useEffect(() => {
    mapRef.current?.setOptions({
      draggableCursor: activeTool === "none" ? null : "crosshair",
    });
  }, [activeTool]);

  // First-load framing: fit the map to the real school bounds so pins are always
  // in view, rather than trusting a hardcoded center. Skipped when the view came
  // from a shared link (a center in the URL hash) so deep links are respected.
  useEffect(() => {
    if (didInitialFit.current || status !== "ready" || !mapRef.current || !schools?.features.length) return;
    didInitialFit.current = true;
    if (window.location.hash.includes("c=")) return;
    // Cinematic first-load reveal: frame the tri-county area (Orange / Orlando,
    // Miami-Dade, Broward) from the school bounds, hold it one step WIDER behind
    // the load splash, then gently zoom in to the frame as the splash lifts. The
    // final camera is always the true fit, so the framing is correct regardless.
    const map = mapRef.current;
    fitToSchools();
    google.maps.event.addListenerOnce(map, "idle", () => {
      const zt = map.getZoom();
      if (typeof zt !== "number") return;
      map.setZoom(Math.max(PILOT_MIN_ZOOM, zt - 1)); // hold wide (behind the splash)
      window.setTimeout(() => {
        if (mapRef.current === map) map.setZoom(zt); // smooth zoom-in as the splash fades
      }, 1200);
    });
  }, [status, schools, fitToSchools]);

  // Google overlay layers, each toggled independently. Created lazily, attached
  // when on and detached when off.
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const map = mapRef.current;
    if (overlays.traffic && !trafficRef.current) trafficRef.current = new google.maps.TrafficLayer();
    trafficRef.current?.setMap(overlays.traffic ? map : null);
    if (overlays.transit && !transitRef.current) transitRef.current = new google.maps.TransitLayer();
    transitRef.current?.setMap(overlays.transit ? map : null);
    if (overlays.bicycling && !bicyclingRef.current) bicyclingRef.current = new google.maps.BicyclingLayer();
    bicyclingRef.current?.setMap(overlays.bicycling ? map : null);
  }, [overlays, status]);

  if (status === "missing-key") return <MissingKeyNotice reason="missing-key" />;
  if (status === "auth-error") return <MissingKeyNotice reason="auth-error" />;
  if (status === "network-error") return <MissingKeyNotice reason="network-error" />;

  return (
    <div className="map-root" ref={rootRef}>
      <div ref={mapEl} className="map-canvas" aria-label="Map of school facilities" role="application" />
      <MapControls
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onFullscreen={toggleFullscreen}
        onReset={fitToSchools}
        isFullscreen={isFullscreen}
      />
      {status === "loading" && <div className="map-loading">Loading the base map...</div>}
      {hover && (
        <div
          className="pin-tooltip pin-tooltip--preview"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          {/* Header: grade badge + school name, then a muted identity line. */}
          <div className="pin-tooltip-head">
            <span
              className="pin-tooltip-grade"
              style={{
                background: rgbaToCss(resolveGradeStyle(hover.grade).fill),
                color: rgbaToCss(resolveGradeStyle(hover.grade).letterColor),
                borderColor: rgbaToCss(resolveGradeStyle(hover.grade).stroke),
                borderStyle: resolveGradeStyle(hover.grade).dashed ? "dashed" : "solid",
              }}
            >
              {resolveGradeStyle(hover.grade).letter}
            </span>
            <span className="pin-tooltip-name">{hover.name}</span>
          </div>
          <div className="pin-tooltip-sub">
            {hover.level} school &middot; {schoolTypeLabel(hover.type)}
          </div>

          {/* A labeled fact list: one row per question a scout asks, each with a
              plainly-labeled value. The facility rate is the statutory COFTE-based
              FUR (utilizationStyle), the single figure used across the tool, so
              nothing here contradicts the inspector or the co-location test. */}
          <dl className="pin-tooltip-facts">
            <div className="pin-tooltip-fact">
              <dt>Facility use rate</dt>
              <dd className={"tt-rate util-" + hover.utilKey}>
                {hover.utilPct != null
                  ? `${hover.utilPct}%${hover.utilBasis === "enrollment" ? " (est.)" : ""}`
                  : "Not reported"}
              </dd>
            </div>
            <div className="pin-tooltip-fact">
              <dt>Underused</dt>
              <dd>
                {hover.underutilized == null ? (
                  <span className="tt-yn tt-yn--na">Unknown</span>
                ) : hover.underutilized ? (
                  <span className="tt-yn tt-yn--yes-opp">Yes</span>
                ) : (
                  <span className="tt-yn tt-yn--no">No</span>
                )}
              </dd>
            </div>
            <div className="pin-tooltip-fact">
              <dt>Persistently low-performing</dt>
              <dd>
                {hover.isPlp ? (
                  <span className="tt-yn tt-yn--yes-plp">Yes</span>
                ) : (
                  <span className="tt-yn tt-yn--no">No</span>
                )}
              </dd>
            </div>
            <div className="pin-tooltip-fact">
              <dt>Co-location eligible</dt>
              <dd>
                {hover.coLocationEligible ? (
                  <span className="tt-yn tt-yn--yes-opp">Yes</span>
                ) : (
                  <span className="tt-yn tt-yn--no">No</span>
                )}
              </dd>
            </div>
          </dl>

          {/* Why it qualifies, only when eligible: the pathways broken out as
              scannable rows. This is a hover PREVIEW (pointer-events: none), so the
              nearby PLP school is named as plain text; click the pin to inspect and
              jump to it from there. */}
          {hover.coLocationEligible && (hover.coLocInOZ || hover.coLocNearestPlp || hover.coLocIsPlpAnchor) && (
            <ul className="pin-tooltip-why">
              {hover.coLocInOZ && <li>In a Qualified Opportunity Zone</li>}
              {hover.coLocNearestPlp && (
                <li>
                  {hover.coLocNearestPlp.miles.toFixed(1)} mi from {hover.coLocNearestPlp.name}{" "}
                  <span className="pin-tooltip-why-note">(low-performing)</span>
                </li>
              )}
              {!hover.coLocInOZ && !hover.coLocNearestPlp && hover.coLocIsPlpAnchor && (
                <li>At a persistently low-performing school</li>
              )}
            </ul>
          )}

          <div className="pin-tooltip-cta">Click the pin to inspect &rarr;</div>
        </div>
      )}
      {sohHover && (
        <div className="pin-tooltip soh-tooltip" style={{ left: sohHover.x + 14, top: sohHover.y + 14 }}>
          <div className="pin-tooltip-head">
            <StarFilled size={16} className="soh-tooltip-star" style={{ color: "#B45309" }} aria-hidden={true} />
            <span className="pin-tooltip-name">{sohHover.kind === "operator" ? sohHover.schoolName : sohHover.operator}</span>
          </div>
          {sohHover.kind === "operator" ? (
            <>
              <div className="pin-tooltip-sub">Hope Operator: {sohHover.operator}</div>
              {sohHover.address && <div className="pin-tooltip-sub" style={{ marginTop: 3 }}>{sohHover.address}</div>}
            </>
          ) : (
            <>
              <div className="pin-tooltip-sub">Existing School of Hope</div>
              <div className="pin-tooltip-sub" style={{ marginTop: 3 }}>{sohHover.address}</div>
              {sohHover.note && <div className="pin-tooltip-sub" style={{ marginTop: 3, fontStyle: "italic" }}>{sohHover.note}</div>}
            </>
          )}
        </div>
      )}
      <div className="map-furniture">
        <ScaleBar />
        <CoordReadout mouse={mouse} />
      </div>
    </div>
  );
}
