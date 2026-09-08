// Presentation for the Context section. Each row shows a label, a value, and its
// source on hover. A "layer not loaded" row carries a one-click enable button; a
// "no data" row states that plainly. Any real value can be copied to clipboard.

import type { SchoolFeature } from "../data/types";
import { useData } from "../data/DataContext";
import { useStore } from "../store";
import { buildContextRows } from "./contextModel";
import { layerById } from "../config/layers";
import { Icon } from "../ui/icons";

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function ContextRows({ school }: { school: SchoolFeature }) {
  const data = useData();
  const activeLayerIds = useStore((s) => s.activeLayerIds);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const rows = buildContextRows(school, data, activeLayerIds);

  return (
    <div className="context-rows">
      {rows.map((row) => (
        <div className={`context-row context-row-${row.state}`} key={row.key}>
          <div className="context-row-label">{row.label}</div>
          <div className="context-row-value">
            {row.state === "value" ? (
              <>
                <span title={row.source} className="context-value-text">
                  {row.value}
                </span>
                <button className="icon-btn copy-btn" aria-label={`Copy ${row.label}`} onClick={() => copy(`${row.label}: ${row.value}`)}>
                  <Icon.Copy size={14} />
                </button>
              </>
            ) : row.state === "not-loaded" ? (
              layerById(row.layerId)?.sample ? (
                <span className="context-empty">
                  layer not loaded
                  <button className="link-btn" onClick={() => toggleLayer(row.layerId)}>
                    Enable
                  </button>
                </span>
              ) : (
                <span className="context-empty">not yet available (no sample in this build)</span>
              )
            ) : (
              <span className="context-empty">{row.value}</span>
            )}
          </div>
          {row.state === "value" && row.source && <div className="context-row-source">{row.source}</div>}
        </div>
      ))}
    </div>
  );
}
