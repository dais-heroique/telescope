import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, VectorTileSource } from "maplibre-gl";
import { ANCIENNETE_BINS, DPE_COLORS, PRIX_BINS } from "@/config/layers";
import type { DvfColor, Basemap } from "@/lib/store";

/** Sous-ensemble de l'état UI nécessaire à la carte (évite un import circulaire avec le store). */
export interface MapUiState {
  basemap: Basemap;
  layers: Record<string, boolean>;
  selected: { idu: string } | null;
  dvfColor: DvfColor;
  filters: Record<string, unknown>;
}

const SOURCES = ["parcelles", "bati", "dvf", "plu", "permis", "copros", "pts"] as const;
type Src = (typeof SOURCES)[number];

/** Sources filtrées par la sélection de l'utilisateur (les autres ne dépendent pas des filtres). */
const FILTERED: Src[] = ["parcelles", "pts"];

function tileUrl(layer: Src, f: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/api/tiles/${layer}/{z}/{x}/{y}.pbf${FILTERED.includes(layer) && f ? `?f=${f}` : ""}`;
}

const prixColor = (): ExpressionSpecification => [
  "case",
  ["==", ["typeof", ["get", "p"]], "number"],
  ["step", ["get", "p"], PRIX_BINS[0].color, 2500, PRIX_BINS[1].color, 4000, PRIX_BINS[2].color, 5500, PRIX_BINS[3].color, 7500, PRIX_BINS[4].color],
  "#98a2b3",
];
const ancienneteColor = (): ExpressionSpecification => [
  "step", ["-", new Date().getFullYear(), ["to-number", ["slice", ["get", "d"], 0, 4], 0]],
  ANCIENNETE_BINS[0].color, 1, ANCIENNETE_BINS[1].color, 2, ANCIENNETE_BINS[2].color, 3, ANCIENNETE_BINS[3].color, 4, ANCIENNETE_BINS[4].color,
];

const dpeFill: ExpressionSpecification = ["match", ["get", "dpe"], ...Object.entries(DPE_COLORS).flat(), "rgba(0,0,0,0)"] as unknown as ExpressionSpecification;
const scoreFill: ExpressionSpecification = [
  "interpolate", ["linear"], ["coalesce", ["get", "s"], 0], 0, "rgba(255,224,138,0)", 40, "#ffe08a", 70, "#f4a261", 100, "#c1121f",
];
const pmFill: ExpressionSpecification = [
  "case",
  ["!", ["to-boolean", ["get", "pm"]]], "rgba(0,0,0,0)",
  ["==", ["get", "pg"], "personnes morales non remarquables"], "#7b2cbf",
  "#98a2b3",
];
const neutralFill: ExpressionSpecification = ["literal", "rgba(0,0,0,0)"] as unknown as ExpressionSpecification;

export function addVigieLayers(map: MlMap, filters: string) {
  // ── Sources PostGIS (tuiles MVT) ──
  for (const s of SOURCES) {
    map.addSource(`v-${s}`, { type: "vector", tiles: [tileUrl(s, filters)], minzoom: 0, maxzoom: 17, promoteId: s === "parcelles" ? { parcelles: "idu" } : undefined });
  }

  // ── Zone de sélection dessinée + brouillon de dessin ──
  map.addSource("zone", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("sectors", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  // ── Zonage PLU (sous les parcelles) ──
  map.addLayer({
    id: "plu-fill", type: "fill", source: "v-plu", "source-layer": "plu", minzoom: 12, layout: { visibility: "none" },
    paint: {
      "fill-color": ["case", ["==", ["get", "t"], "U"], "#e63946", ["in", ["slice", ["get", "t"], 0, 2], ["literal", ["AU"]]], "#f4a261", ["==", ["slice", ["get", "t"], 0, 1], "A"], "#8ab17d", "#2a9d8f"],
      "fill-opacity": 0.38,
    },
  });
  map.addLayer({ id: "plu-line", type: "line", source: "v-plu", "source-layer": "plu", minzoom: 12, layout: { visibility: "none" }, paint: { "line-color": "#0d1626", "line-opacity": 0.35, "line-width": 0.6 } });
  map.addLayer({
    id: "plu-label", type: "symbol", source: "v-plu", "source-layer": "plu", minzoom: 14, layout: { visibility: "none", "text-field": ["get", "l"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
    paint: { "text-color": "#0d1626", "text-halo-color": "#fff", "text-halo-width": 1.2 },
  });

  // ── Bâtiments importés (couleur = année de construction) ──
  map.addLayer({
    id: "bati-fill", type: "fill", source: "v-bati", "source-layer": "bati", minzoom: 15, layout: { visibility: "none" },
    paint: {
      "fill-color": ["interpolate", ["linear"], ["coalesce", ["get", "an"], 1970], 1900, "#5e3c99", 1950, "#b2abd2", 1975, "#fdb863", 2000, "#e66101", 2025, "#d7191c"],
      "fill-opacity": 0.7,
    },
  });

  // ── Parcelles importées : remplissage coloré selon le mode actif ──
  map.addLayer({ id: "vparcelles-fill", type: "fill", source: "v-parcelles", "source-layer": "parcelles", minzoom: 14, paint: { "fill-color": neutralFill, "fill-opacity": 0.6 } });

  // ── Mise en évidence des parcelles qui correspondent aux filtres actifs (tuiles déjà filtrées côté serveur) ──
  map.addLayer({ id: "filter-hl-fill", type: "fill", source: "v-parcelles", "source-layer": "parcelles", minzoom: 14, layout: { visibility: "none" }, paint: { "fill-color": "#6d4aff", "fill-opacity": 0.38 } });
  map.addLayer({ id: "filter-hl-line", type: "line", source: "v-parcelles", "source-layer": "parcelles", minzoom: 14, layout: { visibility: "none" }, paint: { "line-color": "#3b1fa8", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 19, 2.5] } });

  // ── Parcellaire IGN (couverture France entière) : traits, survol, sélection, numéros ──
  map.addLayer({
    id: "parcelles-fill", type: "fill", source: "pci", "source-layer": "parcelle", minzoom: 14,
    paint: {
      "fill-color": "#6d4aff",
      "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.3, 0],
    },
  });
  map.addLayer({
    id: "parcelles-line", type: "line", source: "pci", "source-layer": "parcelle", minzoom: 14,
    paint: { "line-color": "#10294a", "line-opacity": 0.55, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.3, 19, 1.2] },
  });
  map.addLayer({ id: "batiments-fill", type: "fill", source: "pci", "source-layer": "batiment", minzoom: 16, layout: { visibility: "none" }, paint: { "fill-color": "#6b7a90", "fill-opacity": 0.55 } });
  map.addLayer({ id: "parcelle-selected", type: "line", source: "pci", "source-layer": "parcelle", filter: ["==", ["get", "idu"], ""], paint: { "line-color": "#6d4aff", "line-width": 3 } });
  map.addLayer({
    id: "parcelles-label", type: "symbol", source: "pci", "source-layer": "parcelle", minzoom: 18,
    layout: { "text-field": ["get", "numero"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
    paint: { "text-color": "#10294a", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
  });

  // ── Heatmap de score + points d'intérêt ──
  map.addLayer({
    id: "score-heat", type: "heatmap", source: "v-pts", "source-layer": "pts", minzoom: 11, maxzoom: 16, layout: { visibility: "none" },
    paint: {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "s"], 40, 0.2, 100, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.4, 15, 1.4],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 6, 12, 14, 15, 28],
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,224,138,0)", 0.2, "rgba(255,224,138,0.5)", 0.5, "#f4a261", 0.8, "#e63946", 1, "#9d0208"],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.9, 16, 0],
    },
  });
  const circle = (id: string, src: Src, color: ExpressionSpecification | string, minzoom: number, radius: number) =>
    map.addLayer({
      id, type: "circle", source: `v-${src}`, "source-layer": src, minzoom, layout: { visibility: "none" },
      paint: {
        "circle-color": color,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], minzoom, radius * 0.6, 18, radius * 1.8],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.9,
      },
    });
  map.addLayer({ id: "sectors-fill", type: "fill", source: "sectors", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.1 } });
  map.addLayer({ id: "sectors-line", type: "line", source: "sectors", paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [4, 2] } });
  map.addLayer({ id: "sectors-label", type: "symbol", source: "sectors", layout: { "text-field": ["get", "label"], "text-size": 12, "text-font": ["Noto Sans Regular"] }, paint: { "text-color": "#0d1626", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
  map.addLayer({ id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "#6d4aff", "fill-opacity": 0.12 } });
  map.addLayer({ id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#6d4aff", "line-width": 3, "line-dasharray": [2, 1] } });
  map.addLayer({ id: "draft-fill", type: "fill", source: "draft", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#3a86ff", "fill-opacity": 0.12 } });
  map.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#3a86ff", "line-width": 2.5 } });
  map.addLayer({ id: "draft-pts", type: "circle", source: "draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": "#3a86ff", "circle-stroke-width": 2 } });
  circle("dvf-circles", "dvf", prixColor(), 12, 4);
  circle("permis-circles", "permis", "#06d6a0", 13, 4);
  circle("copros-circles", "copros", "#3a86ff", 12, 5);
}

/** Recharge les tuiles des sources filtrées quand les filtres changent. */
export function setVigieTiles(map: MlMap, filters: string) {
  for (const s of FILTERED) {
    const src = map.getSource(`v-${s}`) as VectorTileSource | undefined;
    src?.setTiles([tileUrl(s, filters)]);
  }
}

export function syncVigieLayers(map: MlMap, st: MapUiState) {
  const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  const on = (id: string) => Boolean(st.layers[id]);

  // Fonds
  vis("basemap-plan", st.basemap === "plan");
  vis("basemap-satellite", st.basemap === "satellite");

  // Parcellaire IGN
  const parcels = st.layers["parcelles"] !== false;
  vis("parcelles-fill", parcels);
  vis("parcelles-line", parcels);
  vis("parcelles-label", parcels);
  vis("batiments-fill", on("batiments") || st.basemap === "cadastre");
  if (map.getLayer("parcelles-line")) map.setPaintProperty("parcelles-line", "line-opacity", st.basemap === "cadastre" ? 0.9 : 0.55);

  // Filtres actifs : les parcelles correspondantes sont surlignées sur la carte, sans rien d'autre à activer
  const filtersActive = Object.keys(st.filters).length > 0;
  vis("filter-hl-fill", filtersActive);
  vis("filter-hl-line", filtersActive);

  // Calques importés
  vis("plu-fill", on("plu"));
  vis("plu-line", on("plu"));
  vis("plu-label", on("plu"));
  vis("bati-fill", on("batiments"));
  vis("dvf-circles", on("dvf"));
  vis("permis-circles", on("permis"));
  vis("copros-circles", on("copros"));
  vis("score-heat", on("score"));

  // Couleur de remplissage des parcelles (mode exclusif)
  const fill = on("dpe") ? dpeFill : on("score") ? scoreFill : on("personnes-morales") ? pmFill : neutralFill;
  if (map.getLayer("vparcelles-fill")) {
    map.setPaintProperty("vparcelles-fill", "fill-color", fill);
    vis("vparcelles-fill", on("dpe") || on("score") || on("personnes-morales"));
  }
  if (map.getLayer("dvf-circles")) map.setPaintProperty("dvf-circles", "circle-color", st.dvfColor === "prix" ? prixColor() : ancienneteColor());

  // Parcelle sélectionnée
  if (map.getLayer("parcelle-selected")) map.setFilter("parcelle-selected", ["==", ["get", "idu"], st.selected?.idu ?? ""]);
}

export function setGeoJson(map: MlMap, source: "zone" | "draft" | "sectors", fc: GeoJSON.FeatureCollection) {
  (map.getSource(source) as GeoJSONSource | undefined)?.setData(fc);
}
