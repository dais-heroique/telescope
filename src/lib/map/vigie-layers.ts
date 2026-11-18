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
  resultOpacity: number;
}

const SOURCES = ["parcelles", "bati", "dvf", "plu", "permis", "copros", "pts", "hta-aerien", "hta-souterrain", "bt-aerien", "bt-souterrain", "postes-htabt"] as const;
type Src = (typeof SOURCES)[number];

/** Sources filtrées par la sélection de l'utilisateur (les autres ne dépendent pas des filtres). */
const FILTERED: Src[] = ["parcelles", "pts", "dvf", "permis", "copros"];

/** Couches lues à la demande sur le réseau Enedis (tuiles de 16 au plus). */
const REMOTE_SRC: Src[] = ["hta-aerien", "hta-souterrain", "bt-aerien", "bt-souterrain", "postes-htabt"];

/** Couches raster WMTS de la Géoplateforme IGN (zones protégées / humides, postes sources) : un calque de l'interface = un ou plusieurs rasters. */
interface RasterDef { id: string; layer: string; tms: string; style: string; min: number; max: number; group: "postes-sources" | "zones-protegees" | "zones-humides"; opacity: number }
const PATRINAT = (id: string, layer: string, group: RasterDef["group"], opacity = 0.55): RasterDef => ({ id: `r-${id}`, layer, tms: "PM_6_16", style: "normal", min: 6, max: 16, group, opacity });
const RASTERS: RasterDef[] = [
  { id: "r-postes-sources", layer: "CAPACITE.ACCUEIL.ELECTRIQUE", tms: "PM_6_16", style: "CAPACITE.ACCUEIL.ELECTRIQUE", min: 6, max: 16, group: "postes-sources", opacity: 0.9 },
  PATRINAT("sic", "Patrinat_SIC", "zones-protegees"), PATRINAT("zps", "Patrinat_ZPS", "zones-protegees"),
  PATRINAT("znieff2", "Patrinat_ZNIEFF2", "zones-protegees", 0.45), PATRINAT("znieff1", "Patrinat_ZNIEFF1", "zones-protegees"),
  PATRINAT("pn", "Patrinat_PN", "zones-protegees"), PATRINAT("pnr", "Patrinat_PNR", "zones-protegees", 0.4),
  PATRINAT("rnn", "Patrinat_RNN", "zones-protegees", 0.7), PATRINAT("rnr", "Patrinat_RNR", "zones-protegees", 0.7), PATRINAT("apb", "Patrinat_APB", "zones-protegees", 0.7),
  { id: "r-clc-waw", layer: "LANDCOVER.HR.WAW.CLC15", tms: "PM_0_13", style: "CORINE Land Cover - HR - zones humides et surfaces en eaux permanentes", min: 5, max: 13, group: "zones-humides", opacity: 0.7 },
  PATRINAT("bcae", "TOURBIERES_ZONES-HUMIDES.BCAE", "zones-humides", 0.7), PATRINAT("ramsar", "Patrinat_RAMSAR", "zones-humides", 0.7),
];

const wmtsUrl = (r: RasterDef) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${encodeURIComponent(r.layer)}&STYLE=${encodeURIComponent(r.style)}&FORMAT=image/png&TILEMATRIXSET=${r.tms}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

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
    const remote = REMOTE_SRC.includes(s);
    map.addSource(`v-${s}`, {
      type: "vector", tiles: [tileUrl(s, filters)], minzoom: 0, maxzoom: remote ? 16 : 17,
      promoteId: s === "parcelles" ? { parcelles: "idu" } : s === "plu" ? { plu: "id" } : undefined,
      ...(remote ? { attribution: "Enedis (Licence Ouverte)" } : {}),
    });
  }

  // ── Rasters IGN (sous toutes les couches de données) ──
  for (const r of RASTERS) {
    map.addSource(r.id, { type: "raster", tiles: [wmtsUrl(r)], tileSize: 256, minzoom: r.min, maxzoom: r.max, attribution: "IGN · INPN · Copernicus" });
    map.addLayer({ id: r.id, type: "raster", source: r.id, layout: { visibility: "none" }, paint: { "raster-opacity": r.opacity } });
  }

  // ── Zone de sélection dessinée + brouillon de dessin ──
  map.addSource("zone", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("sectors", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  // ── Zonage PLU (sous les parcelles) ──
  // Zonage PLU : remplissage + limites colorés selon le type (U / AU / A / N), mise en surbrillance au survol
  const pluClass = (u: string, au: string, a: string, n: string): ExpressionSpecification => [
    "case", ["==", ["get", "t"], "U"], u, ["==", ["slice", ["get", "t"], 0, 2], "AU"], au, ["==", ["slice", ["get", "t"], 0, 1], "A"], a, n,
  ];
  const hovered: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
  map.addLayer({
    id: "plu-fill", type: "fill", source: "v-plu", "source-layer": "plu", minzoom: 12, layout: { visibility: "none" },
    paint: { "fill-color": pluClass("#e63946", "#f4a261", "#8ab17d", "#2a9d8f"), "fill-opacity": ["case", hovered, 0.62, 0.38] },
  });
  map.addLayer({
    id: "plu-line", type: "line", source: "v-plu", "source-layer": "plu", minzoom: 12, layout: { visibility: "none", "line-join": "round" },
    paint: {
      "line-color": pluClass("#9d0208", "#c2410c", "#3f6b2a", "#0f6b60"),
      "line-opacity": 0.95,
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, ["case", hovered, 2.4, 0.9], 18, ["case", hovered, 5, 2.4]],
    },
  });
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

  // ── Réseau électrique (Enedis) : lignes aériennes pleines, souterraines pointillées, postes en points ──
  const line = (id: string, src: Src, color: string, minzoom: number, w0: number, w1: number, dash?: number[]) =>
    map.addLayer({
      id, type: "line", source: `v-${src}`, "source-layer": src, minzoom, layout: { visibility: "none", "line-cap": "round" },
      paint: { "line-color": color, "line-width": ["interpolate", ["linear"], ["zoom"], minzoom, w0, 19, w1], ...(dash ? { "line-dasharray": dash } : {}) },
    });
  line("hta-aerien-line", "hta-aerien", "#dc2626", 15, 1.4, 3.2);
  line("hta-souterrain-line", "hta-souterrain", "#2563eb", 15, 1.4, 3.2, [3, 2]);
  line("bt-aerien-line", "bt-aerien", "#f59e0b", 16, 1, 2.4);
  line("bt-souterrain-line", "bt-souterrain", "#0ea5e9", 16, 1, 2.4, [2, 2]);
  circle("postes-htabt-circles", "postes-htabt", "#0f766e", 15, 4);
}

/** Recharge les tuiles des sources filtrées quand les filtres changent. */
export function setVigieTiles(map: MlMap, filters: string) {
  for (const s of FILTERED) {
    const src = map.getSource(`v-${s}`) as VectorTileSource | undefined;
    src?.setTiles([tileUrl(s, filters)]);
  }
}

/** Opacité de base des couches de résultats ; le curseur « Opacité des résultats » les multiplie. */
const RESULT_OPACITY: [id: string, prop: string, base: number][] = [
  ["vparcelles-fill", "fill-opacity", 0.6],
  ["filter-hl-fill", "fill-opacity", 0.38],
  ["filter-hl-line", "line-opacity", 1],
  ["bati-fill", "fill-opacity", 0.7],
  ["dvf-circles", "circle-opacity", 0.9],
  ["dvf-circles", "circle-stroke-opacity", 1],
  ["permis-circles", "circle-opacity", 0.9],
  ["permis-circles", "circle-stroke-opacity", 1],
  ["copros-circles", "circle-opacity", 0.9],
  ["copros-circles", "circle-stroke-opacity", 1],
  ["postes-htabt-circles", "circle-opacity", 0.9],
  ["postes-htabt-circles", "circle-stroke-opacity", 1],
  ["hta-aerien-line", "line-opacity", 1],
  ["hta-souterrain-line", "line-opacity", 1],
  ["bt-aerien-line", "line-opacity", 1],
  ["bt-souterrain-line", "line-opacity", 1],
  ...RASTERS.map((r): [string, string, number] => [r.id, "raster-opacity", r.opacity]),
];

function applyResultOpacity(map: MlMap, k: number) {
  for (const [id, prop, base] of RESULT_OPACITY) if (map.getLayer(id)) map.setPaintProperty(id, prop, base * k);
  const hov: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
  if (map.getLayer("plu-fill")) map.setPaintProperty("plu-fill", "fill-opacity", ["case", hov, 0.62 * k, 0.38 * k]);
  if (map.getLayer("plu-line")) map.setPaintProperty("plu-line", "line-opacity", 0.95 * k);
  if (map.getLayer("score-heat")) map.setPaintProperty("score-heat", "heatmap-opacity", ["interpolate", ["linear"], ["zoom"], 14, 0.9 * k, 16, 0]);
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

  // Réseau électrique, zones protégées / humides
  vis("postes-htabt-circles", on("postes-htabt"));
  vis("hta-aerien-line", on("reseau-aerien"));
  vis("bt-aerien-line", on("reseau-aerien"));
  vis("hta-souterrain-line", on("reseau-souterrain"));
  vis("bt-souterrain-line", on("reseau-souterrain"));
  for (const r of RASTERS) vis(r.id, on(r.group));

  // Couleur de remplissage des parcelles (mode exclusif)
  const fill = on("dpe") ? dpeFill : on("score") ? scoreFill : on("personnes-morales") ? pmFill : neutralFill;
  if (map.getLayer("vparcelles-fill")) {
    map.setPaintProperty("vparcelles-fill", "fill-color", fill);
    vis("vparcelles-fill", on("dpe") || on("score") || on("personnes-morales"));
  }
  if (map.getLayer("dvf-circles")) map.setPaintProperty("dvf-circles", "circle-color", st.dvfColor === "prix" ? prixColor() : ancienneteColor());

  applyResultOpacity(map, st.resultOpacity ?? 1);

  // Parcelle sélectionnée
  if (map.getLayer("parcelle-selected")) map.setFilter("parcelle-selected", ["==", ["get", "idu"], st.selected?.idu ?? ""]);
}

export function setGeoJson(map: MlMap, source: "zone" | "draft" | "sectors", fc: GeoJSON.FeatureCollection) {
  (map.getSource(source) as GeoJSONSource | undefined)?.setData(fc);
}
