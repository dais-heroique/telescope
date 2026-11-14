import { create } from "zustand";
import { MODULES, type ModuleId } from "@/config/modules";

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

interface UiState {
  module: ModuleId;
  basemap: Basemap;
  layers: Record<string, boolean>;
  selected: SelectedParcel | null;
  flyTo: FlyTarget | null;
  paletteOpen: boolean;
  setModule: (m: ModuleId) => void;
  setBasemap: (b: Basemap) => void;
  toggleLayer: (id: string) => void;
  select: (p: SelectedParcel | null) => void;
  fly: (lng: number, lat: number, zoom?: number) => void;
  setPaletteOpen: (o: boolean) => void;
}

const layersFor = (m: ModuleId) => Object.fromEntries(MODULES[m].defaultLayers.map((l) => [l, true]));

export const useUi = create<UiState>((set) => ({
  module: "habitation",
  basemap: "plan",
  layers: layersFor("habitation"),
  selected: null,
  flyTo: null,
  paletteOpen: false,
  setModule: (module) => set({ module, layers: layersFor(module) }),
  setBasemap: (basemap) => set({ basemap }),
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  select: (selected) => set({ selected }),
  fly: (lng, lat, zoom = 17) => set({ flyTo: { lng, lat, zoom, nonce: Date.now() } }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
