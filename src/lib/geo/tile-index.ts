/**
 * Index de tuiles pour libSQL (pas de PostGIS/R-tree) : chaque géométrie est référencée dans les tuiles XYZ
 * qu'elle recouvre, au plus fin niveau de `levels` où elle n'occupe pas plus de MAX_TILES tuiles.
 * Lecture d'une tuile (z,x,y) = UNION des niveaux (ancêtre exact si z ≥ niveau, plage de descendants sinon).
 */
export const MAX_TILES = 36;
export const INLINE_LEVEL = 16;

export function lonToTileX(lon: number, z: number) {
  return Math.min(2 ** z - 1, Math.max(0, Math.floor(((lon + 180) / 360) * 2 ** z)));
}
export function latToTileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  return Math.min(2 ** z - 1, Math.max(0, y));
}

export interface TileRef {
  z: number;
  tx: number;
  ty: number;
}

/** Mono-tuile z16 → { x, y } ; sinon null (la géométrie doit alors être référencée dans la table d'index). */
export function inlineTile(bbox: [number, number, number, number]): { x: number; y: number } | null {
  const x0 = lonToTileX(bbox[0], INLINE_LEVEL), x1 = lonToTileX(bbox[2], INLINE_LEVEL);
  const y0 = latToTileY(bbox[3], INLINE_LEVEL), y1 = latToTileY(bbox[1], INLINE_LEVEL);
  return x0 === x1 && y0 === y1 ? { x: x0, y: y0 } : null;
}

/** Tuiles à indexer pour une emprise [minLon,minLat,maxLon,maxLat]. `levels` triés du plus fin au plus grossier. */
export function indexTiles(bbox: [number, number, number, number], levels: number[]): TileRef[] {
  for (const z of levels) {
    const x0 = lonToTileX(bbox[0], z), x1 = lonToTileX(bbox[2], z);
    const y0 = latToTileY(bbox[3], z), y1 = latToTileY(bbox[1], z);
    const n = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (n <= MAX_TILES || z === levels[levels.length - 1]) {
      const out: TileRef[] = [];
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, tx: x, ty: y });
      return out;
    }
  }
  return [];
}

/** Clause SQL + paramètres sélectionnant les ids d'une table d'index pour la tuile (z,x,y). */
export interface InlineTiles {
  /** Table portant les colonnes de tuile z16 de la tuile « principale » de chaque géométrie mono-tuile. */
  table: string;
  idCol: string;
  xCol: string;
  yCol: string;
}

export interface Range16 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * SELECT d'identifiants pour une plage de tuiles z16 : géométries mono-tuile (colonnes `inline`) UNION géométries
 * multi-tuiles référencées dans `table` aux niveaux `levels` (≤ 16).
 */
export function rangeIndexSql(table: string, r: Range16, levels: number[], inline?: InlineTiles): { sql: string; args: number[] } {
  const parts: string[] = [];
  const args: number[] = [];
  if (inline) {
    parts.push(`select ${inline.idCol} as id from ${inline.table} where ${inline.xCol} between ? and ? and ${inline.yCol} between ? and ?`);
    args.push(r.x0, r.x1, r.y0, r.y1);
  }
  for (const L of levels) {
    const s = INLINE_LEVEL - L;
    parts.push(`select id from ${table} where z = ${L} and tx between ? and ? and ty between ? and ?`);
    args.push(r.x0 >> s, r.x1 >> s, r.y0 >> s, r.y1 >> s);
  }
  return { sql: parts.join(" union "), args };
}

/** Identifiants d'une table d'index pour la tuile XYZ (z,x,y), quel que soit z. */
export function tileIndexSql(table: string, z: number, x: number, y: number, levels: number[], inline?: InlineTiles): { sql: string; args: number[] } {
  return rangeIndexSql(table, pointTileRange(z, x, y, INLINE_LEVEL), levels, inline);
}

/** Plage de tuiles de niveau `L` couvrant la tuile (z,x,y) (pour les points indexés par colonnes tx/ty). */
export function pointTileRange(z: number, x: number, y: number, L: number) {
  if (z >= L) {
    const s = z - L;
    return { x0: x >> s, x1: x >> s, y0: y >> s, y1: y >> s };
  }
  const s = L - z;
  return { x0: x << s, x1: ((x + 1) << s) - 1, y0: y << s, y1: ((y + 1) << s) - 1 };
}
