import { z } from "zod";
import { filtersSchema, buildWhere } from "@/lib/filters";
import { latToTileY, lonToTileX, rangeIndexSql } from "@/lib/geo/tile-index";
import { pointInGeometry } from "@/lib/parcelle/geo";
import { EXPORT_COLUMNS } from "@/lib/export-columns";
import { LEVELS } from "./data-schema";
import { query } from "./db";

export const SORTS = {
  score: "f.score desc nulls last",
  surface: "f.contenance desc nulls last",
  prix: "f.last_sale_price desc nulls last",
  vente: "f.last_sale_date desc nulls last",
  detention: "f.hold_years desc nulls last",
  logements: "f.nb_logements desc nulls last",
} as const;
export type { SortKey } from "./search-types";
type SortKey = keyof typeof SORTS;

const ring = z.array(z.tuple([z.number(), z.number()])).min(4).max(2000);
export const searchSchema = z.object({
  filters: filtersSchema.default({}),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  polygon: z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1).max(8) }).optional(),
  sort: z.enum(Object.keys(SORTS) as [SortKey, ...SortKey[]]).default("score"),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});
export type SearchParams = z.infer<typeof searchSchema>;

export const LIST_COLUMNS = "f.idu, f.adresse, f.insee, f.section, f.numero, f.contenance, f.lon, f.lat, f.usage_principal, f.annee_construction, f.nb_logements, f.emprise_bati, f.last_sale_date, f.last_sale_price, f.last_sale_prix_m2, f.hold_years, f.dpe_latest, f.plu_type, f.is_pm, f.pm_denomination, f.pm_forme, f.is_copro, f.score, f.is_passoire, f.is_divisible, f.is_monopropriete, f.is_dent_creuse";
const RAW_LIMIT = 5000;
const MAX_TILES = 6000;

export interface ListRow {
  idu: string; adresse: string | null; insee: string; section: string; numero: string; contenance: number | null; lon: number; lat: number;
  usage_principal: string | null; annee_construction: number | null; nb_logements: number | null; emprise_bati: number | null;
  last_sale_date: string | null; last_sale_price: number | null; last_sale_prix_m2: number | null; hold_years: number | null; dpe_latest: string | null;
  plu_type: string | null; is_pm: number; pm_denomination: string | null; pm_forme: string | null; is_copro: number; score: number | null;
  is_passoire: number; is_divisible: number; is_monopropriete: number; is_dent_creuse: number;
}

export interface SearchResult<T = ListRow> {
  rows: T[];
  total: number;
  truncated: boolean;
  tooWide: boolean;
}

function regionBBox(p: SearchParams): [number, number, number, number] | null {
  if (p.polygon) {
    const pts = p.polygon.coordinates.flat();
    return [Math.min(...pts.map((c) => c[0])), Math.min(...pts.map((c) => c[1])), Math.max(...pts.map((c) => c[0])), Math.max(...pts.map((c) => c[1]))];
  }
  return p.bbox ?? null;
}

/**
 * Parcelles d'une zone (polygone dessiné ou emprise de la carte) satisfaisant les filtres.
 * 1) sélection des identifiants par plage de tuiles z16 (index) 2) filtres SQL 3) découpe exacte par polygone sur le centroïde.
 */
export async function searchParcels<T = ListRow>(p: SearchParams, opts: { columns?: string; rawLimit?: number } = {}): Promise<SearchResult<T>> {
  const bb = regionBBox(p);
  if (!bb) return { rows: [], total: 0, truncated: false, tooWide: false };
  const r = { x0: lonToTileX(bb[0], 16), x1: lonToTileX(bb[2], 16), y0: latToTileY(bb[3], 16), y1: latToTileY(bb[1], 16) };
  if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > MAX_TILES) return { rows: [], total: 0, truncated: false, tooWide: true };

  const idx = rangeIndexSql("idx_parcelles", r, [...LEVELS.parcelles], { table: "parcelles", idCol: "idu", xCol: "t16x", yCol: "t16y" });
  const w = buildWhere(p.filters);
  const rawLimit = opts.rawLimit ?? RAW_LIMIT;
  const rows = await query<T & { lon: number; lat: number }>(
    `select ${opts.columns ?? LIST_COLUMNS} from parcelles f
     where f.idu in (${idx.sql}) and f.lon between ? and ? and f.lat between ? and ?${w.text}
     order by ${SORTS[p.sort]} limit ${rawLimit}`,
    [...idx.args, bb[0], bb[2], bb[1], bb[3], ...w.params],
  );
  const poly: GeoJSON.Polygon | null = p.polygon ?? null;
  const inside = poly ? rows.filter((x) => pointInGeometry([x.lon, x.lat], poly)) : rows;
  return { rows: inside, total: inside.length, truncated: rows.length >= rawLimit, tooWide: false };
}

export function exportSelect(keys: string[]): { sql: string; cols: typeof EXPORT_COLUMNS } {
  const cols = EXPORT_COLUMNS.filter((c) => keys.includes(c.key));
  const use = cols.length ? cols : EXPORT_COLUMNS.filter((c) => c.default);
  // lon/lat toujours sélectionnés (découpe par polygone)
  return { sql: `${use.map((c) => `${c.sql} as ${c.key}`).join(", ")}, f.lon as _lon, f.lat as _lat`, cols: use };
}
