import geojsonvtModule from "geojson-vt";
import { fromGeojsonVt } from "vt-pbf";
import { buildWhere, type Filters } from "@/lib/filters";
import { decodeGeom } from "@/lib/geo/codec";
import { pointTileRange, tileIndexSql } from "@/lib/geo/tile-index";
import { LEVELS, POINT_LEVEL } from "./data-schema";
import { query } from "./db";

export const TILE_LAYERS = ["parcelles", "bati", "dvf", "plu", "permis", "copros", "pts"] as const;
export type TileLayer = (typeof TILE_LAYERS)[number];

/** Zoom minimal servi par couche (au-dessous : tuile vide, pour protéger la base). */
export const MIN_ZOOM: Record<TileLayer, number> = { parcelles: 14, bati: 15, dvf: 12, plu: 12, permis: 13, copros: 12, pts: 11 };

// geojson-vt v4 : export par défaut = classe (les typings embarqués ne la déclarent pas comme constructible).
const GeoJSONVT = geojsonvtModule as unknown as new (data: GeoJSON.FeatureCollection, options: Record<string, number>) => { getTile(z: number, x: number, y: number): unknown };

type Props = Record<string, string | number | null>;
type Blob = ArrayBuffer | Uint8Array;

const feat = (geometry: GeoJSON.Geometry, properties: Props): GeoJSON.Feature => ({ type: "Feature", geometry, properties });
const point = (lon: number, lat: number, properties: Props) => feat({ type: "Point", coordinates: [lon, lat] }, properties);

/**
 * Condition SQL « lié à au moins une parcelle qui satisfait les filtres » pour les couches de points (ventes, permis, copropriétés).
 * Sans filtre actif : aucune restriction. `link` = table de liaison vers les parcelles, `key` = clé de l'objet.
 */
function linked(filters: Filters, link: string, key: string): { text: string; params: (string | number)[] } {
  if (Object.keys(filters).length === 0) return { text: "", params: [] };
  const w = buildWhere(filters);
  return { text: ` and ${key} in (select l.${key} from ${link} l join parcelles f on f.idu = l.idu where 1 = 1${w.text})`, params: [...w.params] };
}

/** Lignes SQL d'une couche → FeatureCollection GeoJSON. */
async function layerFeatures(layer: TileLayer, z: number, x: number, y: number, filters: Filters): Promise<GeoJSON.Feature[]> {
  switch (layer) {
    case "parcelles": {
      const idx = tileIndexSql("idx_parcelles", z, x, y, [...LEVELS.parcelles], { table: "parcelles", idCol: "idu", xCol: "t16x", yCol: "t16y" });
      const w = buildWhere(filters);
      const rows = await query<Props & { geom: Blob }>(
        `select f.idu, f.contenance as c, f.dpe_latest as dpe, f.score as s, f.last_sale_prix_m2 as pm2, f.hold_years as h, f.plu_type as plu,
                f.is_pm as pm, f.pm_groupe as pg, f.is_copro as cp, f.is_passoire as ps, f.usage_principal as u, f.annee_construction as an,
                f.nb_logements as nl, f.is_divisible as dv, f.is_monopropriete as mo, f.geom
         from parcelles f where f.idu in (${idx.sql}) ${z >= 15 ? "" : "and coalesce(f.contenance, 0) >= 150"}${w.text}`,
        [...idx.args, ...w.params],
      );
      return rows.map(({ geom, ...p }) => feat(decodeGeom(geom), p));
    }
    case "bati": {
      const idx = tileIndexSql("idx_batiments", z, x, y, [...LEVELS.batiments], { table: "batiments", idCol: "bg_id", xCol: "t16x", yCol: "t16y" });
      const rows = await query<Props & { geom: Blob }>(
        `select b.bg_id as id, b.annee_construction as an, b.nb_log as nl, b.hauteur_max as h, b.usage_principal as u, b.surface_sol as s,
                (b.rnic_numero is not null) as cp, b.geom from batiments b where b.bg_id in (${idx.sql})`,
        idx.args,
      );
      return rows.map(({ geom, ...p }) => feat(decodeGeom(geom), p));
    }
    case "plu": {
      const idx = tileIndexSql("idx_plu_zones", z, x, y, [...LEVELS.plu_zones]);
      const rows = await query<Props & { geom: Blob }>(`select p.gid as id, p.typezone as t, p.libelle as l, p.geom from plu_zones p where p.gid in (${idx.sql})`, idx.args);
      return rows.map(({ geom, ...p }) => feat(decodeGeom(geom), p));
    }
    case "dvf": {
      const r = pointTileRange(z, x, y, POINT_LEVEL);
      // Filtres actifs : seules les ventes portant sur des parcelles qui satisfont les filtres restent affichées
      const w = linked(filters, "dvf_mutation_parcelles", "id_mutation");
      const rows = await query<Props & { lon: number; lat: number }>(
        `select id_mutation as id, date_mutation as d, prix_m2 as p, valeur_fonciere as v, type_principal as t, lon, lat from dvf_mutations
         where tx between ? and ? and ty between ? and ? and valeur_fonciere > 0 ${z >= 14 ? "" : "and prix_m2 is not null"}${w.text}`,
        [r.x0, r.x1, r.y0, r.y1, ...w.params],
      );
      return rows.map(({ lon, lat, ...p }) => point(lon, lat, p));
    }
    case "permis": {
      const r = pointTileRange(z, x, y, POINT_LEVEL);
      const w = linked(filters, "permis_parcelles", "num_dau");
      const rows = await query<Props & { lon: number; lat: number }>(
        `select num_dau as id, type_dau as t, kind as k, date_autorisation as d, nb_logements as nl, lon, lat from permis
         where tx between ? and ? and ty between ? and ? and date_autorisation >= date('now', '-5 years') and lon is not null${w.text}`,
        [r.x0, r.x1, r.y0, r.y1, ...w.params],
      );
      return rows.map(({ lon, lat, ...p }) => point(lon, lat, p));
    }
    case "copros": {
      const r = pointTileRange(z, x, y, POINT_LEVEL);
      const w = linked(filters, "rnic_parcelles", "numero");
      const rows = await query<Props & { lon: number; lat: number }>(
        `select numero as id, nom as n, nb_lots as lots, periode_construction as per, lon, lat from rnic_copros where tx between ? and ? and ty between ? and ? and lon is not null${w.text}`,
        [r.x0, r.x1, r.y0, r.y1, ...w.params],
      );
      return rows.map(({ lon, lat, ...p }) => point(lon, lat, p));
    }
    case "pts": {
      // Points « opportunités » pour la heatmap : parcelles notées ≥ 40 (≥ 70 en vue large, plafonné).
      const r = pointTileRange(z, x, y, POINT_LEVEL);
      const w = buildWhere(filters);
      const rows = await query<{ s: number; lon: number; lat: number }>(
        `select f.score as s, f.lon, f.lat from parcelles f where f.tx between ? and ? and f.ty between ? and ? and f.score >= 40 and f.score >= ${z >= 11 ? 50 : 70}${w.text} limit 20000`,
        [r.x0, r.x1, r.y0, r.y1, ...w.params],
      );
      return rows.map(({ lon, lat, s }) => point(lon, lat, { s }));
    }
  }
}

/** Génère la tuile vectorielle (MVT/pbf) d'une couche, ou `null` si elle est vide. */
export async function renderTile(layer: TileLayer, z: number, x: number, y: number, filters: Filters = {}): Promise<Uint8Array | null> {
  const features = await layerFeatures(layer, z, x, y, filters);
  if (!features.length) return null;
  const index = new GeoJSONVT({ type: "FeatureCollection", features }, { maxZoom: z, indexMaxZoom: 0, indexMaxPoints: 0, tolerance: 3, extent: 4096, buffer: 64 });
  const tile = index.getTile(z, x, y);
  if (!tile) return null;
  return fromGeojsonVt({ [layer]: tile } as never, { version: 2, extent: 4096 });
}
