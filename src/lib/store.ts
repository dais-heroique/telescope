import { create } from "zustand";
import { MODULES, type ModuleId } from "@/config/modules";
import type { Filters } from "@/lib/filters";
import { PARCEL_COLOR_GROUP } from "@/config/layers";

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

interface UiState {
  module: ModuleId;
  filters: Filters;
  dvfColor: DvfColor;
  basemap: Basemap;
  layers: Record<string, boolean>;
  selected: SelectedParcel | null;
  flyTo: FlyTarget | null;
  paletteOpen: boolean;
  setModule: (m: ModuleId) => void;
  setFilters: (f: Filters) => void;
  setDvfColor: (c: DvfColor) => void;
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
  basemap: "plan",
  layers: layersFor("habitation"),
  selected: null,
  flyTo: null,
  paletteOpen: false,
  setModule: (module) => set({ module, layers: layersFor(module) }),
  setFilters: (filters) => set({ filters }),
  setDvfColor: (dvfColor) => set({ dvfColor }),
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
