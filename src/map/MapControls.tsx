// Custom map control stack, styled to match the app design language: a vertical
// column of white rounded-square buttons in the bottom-right corner. Zoom in,
// zoom out, fullscreen toggle, and reset-to-data. Replaces Google's small
// native zoom control (disabled in MapView) so the controls share the same
// surface, radius, and shadow as the rest of the floating furniture.

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
        <button className="map-ctrl-btn" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
          <Icon.ZoomIn size={18} />
        </button>
        <span className="map-ctrl-sep" aria-hidden />
        <button className="map-ctrl-btn" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
          <Icon.ZoomOut size={18} />
        </button>
      </div>
      <button
        className="map-ctrl-btn map-ctrl-solo"
        onClick={onFullscreen}
        aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
        title={isFullscreen ? "Exit full screen" : "Full screen"}
      >
        {isFullscreen ? <Icon.ExitFullscreen size={17} /> : <Icon.Fullscreen size={17} />}
      </button>
      <button
        className="map-ctrl-btn map-ctrl-solo"
        onClick={onReset}
        aria-label="Reset view to all schools"
        title="Reset view to all schools"
      >
        <Icon.Compass size={18} />
      </button>
    </div>
  );
}
