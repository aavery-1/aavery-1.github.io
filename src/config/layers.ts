// Typed loader for 07_LAYERS.config.json. The layer panel, legends, deck.gl
// layers, and inspector context rows are all built from this file. Adding a
// rendered layer means editing that JSON plus an adapter and (if it renders) a
// sample file. Nothing else in the UI changes.

import rawConfig from "../../07_LAYERS.config.json";

export type RenderType = "point" | "polygon" | "choropleth" | "isochrone";
export type LayerGroup = "Schools" | "Demand" | "Risk" | "Boundaries" | "Context";

export interface ColorRamp {
  type: "sequential" | "diverging";
  domain: number[];
  stops: string[];
}

// Style is intentionally loose: each render type reads the fields it needs.
export interface LayerStyle {
  pinSize?: number;
  letterInsidePin?: boolean;
  colorMap?: Record<string, string | { fill: string; stroke: string; strokeDash?: number[] }>;
  colorRamp?: ColorRamp;
  fillByZone?: Record<string, string>;
  fillOpacity?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  showDistrictLabels?: boolean;
  labelField?: string;
  hatchPatternForZones?: string[];
  chamberStyles?: Record<string, { strokeDash: number[] | null }>;
  [key: string]: unknown;
}

export interface LayerConfig {
  id: string;
  label: string;
  legendCaption: string;
  group: LayerGroup;
  phase: string;
  renderType: RenderType;
  geometry: string;
  defaultOn: boolean;
  colorBy?: string;
  joinKey: string;
  source: string;
  vintage: string;
  unit: string | null;
  resolution?: string;
  sample: string | null;
  sampleSchema: string | null;
  style: LayerStyle;
  zOrder: number;
  minZoom: number;
  maxZoom: number;
  notes: string;
}

export interface DatasetConfig {
  id: string;
  label: string;
  purpose: string;
  joinKey: string;
  source: string;
  vintage: string;
  unit: string | null;
  sample: string | null;
  sampleSchema: string | null;
  notes: string;
}

interface RawConfig {
  regions: string[];
  groups: LayerGroup[];
  renderTypes: Record<string, string>;
  layers: LayerConfig[];
  datasets: DatasetConfig[];
}

const config = rawConfig as unknown as RawConfig;

export const REGIONS = config.regions;
export const GROUPS = config.groups;
export const RENDER_TYPES = config.renderTypes;
export const LAYERS: LayerConfig[] = config.layers;
export const DATASETS: DatasetConfig[] = config.datasets;

export function layerById(id: string): LayerConfig | undefined {
  return LAYERS.find((l) => l.id === id);
}

export function datasetById(id: string): DatasetConfig | undefined {
  return DATASETS.find((d) => d.id === id);
}

// Layers grouped for the panel, in config order within each group.
export function layersByGroup(): Array<{ group: LayerGroup; layers: LayerConfig[] }> {
  return GROUPS.map((group) => ({ group, layers: LAYERS.filter((l) => l.group === group) }));
}

// A layer renders on the map only if it has a committed sample in this build.
// Layers without a sample still appear in the panel (disabled with a tooltip).
export function hasSample(layer: LayerConfig): boolean {
  return Boolean(layer.sample);
}
