import { create } from "zustand";
import { MODULES, type ModuleId } from "@/config/modules";
import type { Filters } from "@/lib/filters";
import { PARCEL_COLOR_GROUP } from "@/config/layers";
import type { SortKey } from "@/lib/server/search-types";

export type Basemap = "plan" | "satellite" | "cadastre";

export interface SelectedParcel {
  idu: string;
  section?: string;
  numero?: string;
  contenance?: number;
  commune?: string;
  codeInsee?: string;
}

interface FlyTarget {
  lng: number;
  lat: number;
  zoom?: number;
  nonce: number;
}

export type DvfColor = "prix" | "anciennete";
export type DrawMode = "polygon" | "circle" | "isochrone" | null;
export type LeftTab = "calques" | "filtres" | "resultats";
export interface Viewport {
  bbox: [number, number, number, number];
  zoom: number;
}

interface UiState {
  module: ModuleId;
  filters: Filters;
  dvfColor: DvfColor;
  zone: GeoJSON.Polygon | null;
  drawMode: DrawMode;
  iso: { mode: "pedestrian" | "car"; minutes: number };
  viewport: Viewport | null;
  sort: SortKey;
  leftTab: LeftTab;
  finishNonce: number;
  leftOpen: boolean;
  sectors: { id: string; name: string; polygon: GeoJSON.Polygon; color: string; assignedTo: string | null }[];
  basemap: Basemap;
  layers: Record<string, boolean>;
  selected: SelectedParcel | null;
  flyTo: FlyTarget | null;
  paletteOpen: boolean;
  setModule: (m: ModuleId) => void;
  setFilters: (f: Filters) => void;
  setDvfColor: (c: DvfColor) => void;
  setZone: (z: GeoJSON.Polygon | null) => void;
  setDrawMode: (m: DrawMode) => void;
  setIso: (i: { mode: "pedestrian" | "car"; minutes: number }) => void;
  setViewport: (v: Viewport) => void;
  setSort: (s: SortKey) => void;
  setLeftTab: (t: LeftTab) => void;
  finishDraw: () => void;
  toggleLeft: () => void;
  setSectors: (s: UiState["sectors"]) => void;
  setBasemap: (b: Basemap) => void;
  toggleLayer: (id: string) => void;
  select: (p: SelectedParcel | null) => void;
  fly: (lng: number, lat: number, zoom?: number) => void;
  setPaletteOpen: (o: boolean) => void;
}

const layersFor = (m: ModuleId) => Object.fromEntries(MODULES[m].defaultLayers.map((l) => [l, true]));

export const useUi = create<UiState>((set) => ({
  module: "habitation",
  filters: {},
  dvfColor: "prix",
  zone: null,
  drawMode: null,
  iso: { mode: "pedestrian", minutes: 10 },
  viewport: null,
  sort: "score",
  leftTab: "calques",
  finishNonce: 0,
  leftOpen: true,
  sectors: [],
  basemap: "plan",
  layers: layersFor("habitation"),
  selected: null,
  flyTo: null,
  paletteOpen: false,
  setModule: (module) => set({ module, layers: layersFor(module) }),
  setFilters: (filters) => set({ filters }),
  setDvfColor: (dvfColor) => set({ dvfColor }),
  setZone: (zone) => set((s) => ({ zone, drawMode: null, leftTab: zone ? "resultats" : s.leftTab })),
  setDrawMode: (drawMode) => set({ drawMode }),
  setIso: (iso) => set({ iso }),
  setViewport: (viewport) => set({ viewport }),
  setSort: (sort) => set({ sort }),
  setLeftTab: (leftTab) => set({ leftTab }),
  finishDraw: () => set((s) => ({ finishNonce: s.finishNonce + 1 })),
  setSectors: (sectors) => set({ sectors }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  setBasemap: (basemap) => set({ basemap }),
  toggleLayer: (id) =>
    set((s) => {
      const on = !s.layers[id];
      const next = { ...s.layers, [id]: on };
      // Les calques qui colorent les parcelles sont exclusifs (un seul à la fois).
      if (on && PARCEL_COLOR_GROUP.includes(id)) for (const o of PARCEL_COLOR_GROUP) if (o !== id) next[o] = false;
      return { layers: next };
    }),
  select: (selected) => set({ selected }),
  fly: (lng, lat, zoom = 17) => set({ flyTo: { lng, lat, zoom, nonce: Date.now() } }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
