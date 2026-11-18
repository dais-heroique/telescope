import type { StyleSpecification } from "maplibre-gl";

/**
 * Fonds et sources IGN Géoplateforme (vérifiés, cf. docs/sources.md).
 * - Plan IGN v2 et orthophotos : WMTS (tuiles raster, grille PM = Web Mercator, TILEROW = y XYZ)
 * - Parcellaire : tuiles vectorielles PCI (couches parcelle / batiment / feuille / commune)
 */
const WMTS = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM";
const wmts = (layer: string, format: "image/png" | "image/jpeg") =>
  `${WMTS}&LAYER=${layer}&FORMAT=${format}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

export const PCI_TILES = "https://data.geopf.fr/tms/1.0.0/PCI/{z}/{x}/{y}.pbf";

export const ATTRIBUTION =
  '© <a href="https://geoservices.ign.fr" target="_blank" rel="noreferrer">IGN</a> · Cadastre © <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Licence Ouverte Etalab</a>';

export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    name: "vigie",
    glyphs: "https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf",
    sources: {
      plan: {
        type: "raster",
        tiles: [wmts("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "image/png")],
        tileSize: 256,
        maxzoom: 19,
        attribution: ATTRIBUTION,
      },
      ortho: {
        type: "raster",
        tiles: [wmts("ORTHOIMAGERY.ORTHOPHOTOS", "image/jpeg")],
        tileSize: 256,
        maxzoom: 19,
        attribution: ATTRIBUTION,
      },
      pci: {
        type: "vector",
        tiles: [PCI_TILES],
        minzoom: 12,
        maxzoom: 19,
        promoteId: { parcelle: "idu" },
        attribution: ATTRIBUTION,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#e9edf3" } },
      { id: "basemap-plan", type: "raster", source: "plan" },
      { id: "basemap-satellite", type: "raster", source: "ortho", layout: { visibility: "none" } },
    ],
  };
}
