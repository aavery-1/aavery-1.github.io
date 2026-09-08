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

  const onSchoolHover = useCallback((info: SchoolHoverInfo | null) => setHover(info), []);
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
    m.fitBounds(bounds, { top: 70, right: 40, bottom: 260, left: 80 });
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
      else if (tool === "draw") useStore.getState().addDrawPoint(p);
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
    // Extra bottom padding clears the summary/list callouts; left padding clears
    // the filter rail.
    fitToSchools();
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
        <div className="pin-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
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
            {hover.level} school, {schoolTypeLabel(hover.type)}. Grade {hover.grade}.
          </div>
          <div
            className={
              "pin-tooltip-util " +
              (hover.utilizationBucket === "over"
                ? "util-over"
                : hover.utilizationBucket === "under"
                  ? "util-under"
                  : hover.utilizationBucket === "target"
                    ? "util-target"
                    : "util-unknown")
            }
          >
            {hover.utilizationPct != null && hover.enrollment != null && hover.capacity != null
              ? `Utilization ${hover.utilizationPct}% (${hover.enrollment.toLocaleString("en-US")} of ${hover.capacity.toLocaleString("en-US")})`
              : "Utilization not available"}
          </div>
          {hover.coLocationEligible && (
            <div className="pin-tooltip-coloc">
              Co-location candidate{hover.coLocationReason ? `: ${hover.coLocationReason}.` : " (underused district facility in a siting area)"}
            </div>
          )}
          <div className="pin-tooltip-sub" style={{ marginTop: 3 }}>Click to inspect.</div>
        </div>
      )}
      {sohHover && (
        <div className="pin-tooltip soh-tooltip" style={{ left: sohHover.x + 14, top: sohHover.y + 14 }}>
          <div className="pin-tooltip-head">
            <span className="soh-tooltip-star" aria-hidden>★</span>
            <span className="pin-tooltip-name">{sohHover.operator}</span>
          </div>
          <div className="pin-tooltip-sub">Existing School of Hope</div>
          <div className="pin-tooltip-sub" style={{ marginTop: 3 }}>{sohHover.address}</div>
          {sohHover.note && <div className="pin-tooltip-sub" style={{ marginTop: 3, fontStyle: "italic" }}>{sohHover.note}</div>}
        </div>
      )}
      <div className="map-furniture">
        <ScaleBar />
        <CoordReadout mouse={mouse} />
      </div>
    </div>
  );
}
