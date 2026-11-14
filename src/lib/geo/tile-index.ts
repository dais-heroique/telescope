/**
 * Index de tuiles pour libSQL (pas de PostGIS/R-tree) : chaque géométrie est référencée dans les tuiles XYZ
 * qu'elle recouvre, au plus fin niveau de `levels` où elle n'occupe pas plus de MAX_TILES tuiles.
 * Lecture d'une tuile (z,x,y) = UNION des niveaux (ancêtre exact si z ≥ niveau, plage de descendants sinon).
 */
export const MAX_TILES = 36;

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
export function tileIndexSql(table: string, z: number, x: number, y: number, levels: number[]): { sql: string; args: number[] } {
  const parts: string[] = [];
  const args: number[] = [];
  for (const L of levels) {
    if (z >= L) {
      const s = z - L;
      parts.push(`select id from ${table} where z = ${L} and tx = ? and ty = ?`);
      args.push(x >> s, y >> s);
    } else {
      const s = L - z;
      parts.push(`select id from ${table} where z = ${L} and tx between ? and ? and ty between ? and ?`);
      args.push(x << s, ((x + 1) << s) - 1, y << s, ((y + 1) << s) - 1);
    }
  }
  return { sql: parts.join(" union "), args };
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
