// Custom map control stack, styled to match the app design language: a vertical
// column of square Carbon icon buttons in the bottom-right corner. Zoom in,
// zoom out, fullscreen toggle, and reset-to-data. Replaces Google's small
// native zoom control (disabled in MapView) so the controls share the same
// surface and shadow as the rest of the floating furniture, and labels them with
// the same Carbon Tooltip the top-right cluster uses (not a native title).

import { Tooltip } from "@carbon/react";
import { Icon } from "../ui/icons";

export function MapControls({
  onZoomIn,
  onZoomOut,
  onFullscreen,
  onReset,
  isFullscreen,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFullscreen: () => void;
  onReset: () => void;
  isFullscreen: boolean;
}) {
  return (
    <div className="map-controls" role="group" aria-label="Map controls">
      <div className="map-controls-group">
        <Tooltip label="Zoom in" align="left">
          <button type="button" className="map-ctrl-btn" onClick={onZoomIn} aria-label="Zoom in">
            <Icon.ZoomIn size={18} />
          </button>
        </Tooltip>
        <span className="map-ctrl-sep" aria-hidden />
        <Tooltip label="Zoom out" align="left">
          <button type="button" className="map-ctrl-btn" onClick={onZoomOut} aria-label="Zoom out">
            <Icon.ZoomOut size={18} />
          </button>
        </Tooltip>
      </div>
      {/* Only render fullscreen where the browser actually allows it. In an
          embedded/sandboxed frame (the app preview) document.fullscreenEnabled is
          false and requestFullscreen is a silent no-op, so the button would look
          broken; in a real deployed tab it is available and works. */}
      {typeof document !== "undefined" && document.fullscreenEnabled && (
        <Tooltip label={isFullscreen ? "Exit full screen" : "Full screen"} align="left">
          <button
            type="button"
            className="map-ctrl-btn map-ctrl-solo"
            onClick={onFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            {isFullscreen ? <Icon.ExitFullscreen size={17} /> : <Icon.Fullscreen size={17} />}
          </button>
        </Tooltip>
      )}
      <Tooltip label="Reset view to all schools" align="left">
        <button
          type="button"
          className="map-ctrl-btn map-ctrl-solo"
          onClick={onReset}
          aria-label="Reset view to all schools"
        >
          <Icon.Compass size={18} />
        </button>
      </Tooltip>
    </div>
  );
}
