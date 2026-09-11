// Base map: the base imagery picker (Default / Satellite / Terrain) and the
// Google overlay toggles (traffic, transit, bicycling), in one flyout panel off a
// top-right icon button. The base imagery is a single choice, shown as labeled
// preview cards; the overlays are independent switches. The button is bare (no
// card of its own) so it can sit inside the shared top-right control group next
// to the legend, matching the bottom-right zoom cluster.
//
// Real IBM Carbon: Popover + IconButton + Toggle, no MUI. No em dashes.

import { useState } from "react";
import { IconButton, Popover, PopoverContent, Toggle, RadioButtonGroup, RadioButton } from "@carbon/react";
import { Map as MapIcon } from "@carbon/icons-react";
import { useStore, type BaseMapType, type MapOverlays } from "../store";
import "./MapLayersControl.carbon.css";

const OVERLAYS: Array<{ key: keyof MapOverlays; label: string }> = [
  { key: "traffic", label: "Traffic" },
  { key: "transit", label: "Transit" },
  { key: "bicycling", label: "Bicycling" },
];

const VIEWS: Array<{ value: BaseMapType; label: string }> = [
  { value: "roadmap", label: "Default" },
  { value: "satellite", label: "Satellite" },
  { value: "terrain", label: "Terrain" },
];

export function MapLayersControl() {
  const baseMapType = useStore((s) => s.baseMapType);
  const setBaseMapType = useStore((s) => s.setBaseMapType);
  const overlays = useStore((s) => s.overlays);
  const toggleOverlay = useStore((s) => s.toggleOverlay);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onRequestClose={() => setOpen(false)} align="bottom-right" dropShadow>
      <IconButton
        label="Map style"
        aria-label="Map style and overlays"
        kind="ghost"
        size="md"
        align="left"
        className={`map-layers-trigger${open ? " map-layers-trigger--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <MapIcon size={18} />
      </IconButton>
      <PopoverContent>
        <div className="map-layers-panel">
          <h3 className="map-layers-heading">Map style</h3>

          <div className="map-layers-views">
            {VIEWS.map((v) => {
              const selected = baseMapType === v.value;
              const Ico = v.icon;
              return (
                <div
                  key={v.value}
                  role="button"
                  tabIndex={0}
                  onClick={() => setBaseMapType(v.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBaseMapType(v.value); } }}
                  className="map-layers-view"
                >
                  <div
                    className={`map-layers-view__swatch${selected ? " map-layers-view__swatch--selected" : ""}`}
                    style={{ background: v.bg }}
                  >
                    <Ico size={20} style={{ color: v.fg }} />
                  </div>
                  <span className={`map-layers-view__label${selected ? " map-layers-view__label--selected" : ""}`}>
                    {v.label}
                  </span>
                </div>
              );
            })}
          </div>

          <hr className="map-layers-rule" />

          <span className="map-layers-section map-layers-section--overlays">Overlays</span>
          <div className="map-layers-overlays">
            {OVERLAYS.map((o) => (
              <div key={o.key} className="map-layers-overlay">
                <span className="map-layers-overlay__label">{o.label}</span>
                <Toggle
                  id={`map-overlay-${o.key}`}
                  size="sm"
                  hideLabel
                  labelText={o.label}
                  toggled={overlays[o.key]}
                  onToggle={() => toggleOverlay(o.key)}
                />
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
