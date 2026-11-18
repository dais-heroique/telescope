import { fetchJson } from "./cache";


/**
 * Réseau électrique de distribution (Enedis, Licence Ouverte) lu à la demande, tuile par tuile, via l'API Opendatasoft publique
 * `opendata.enedis.fr` (filtre `within_distance` sur le point représentatif de chaque tronçon : le filtre `geofilter.bbox` est ignoré
 * par cette API). Aucune donnée n'est stockée chez nous.
 *  - postes HTA/BT : points ; réseaux HTA et BT, aériens et souterrains : lignes.
 */
export const REMOTE_DATASETS = {
  "hta-aerien": "reseau-hta",
  "hta-souterrain": "reseau-souterrain-hta",
  "bt-aerien": "reseau-bt",
  "bt-souterrain": "reseau-souterrain-bt",
  "postes-htabt": "poste-electrique",
} as const;
export type RemoteLayer = keyof typeof REMOTE_DATASETS;

export const isRemoteLayer = (l: string): l is RemoteLayer => l in REMOTE_DATASETS;

const BASE = "https://opendata.enedis.fr/api/explore/v2.1/catalog/datasets";
const LIMIT = 5000; // objets maximum par tuile (les zooms minimaux gardent les tuiles sous ce plafond hors hyper-centres)
const TTL = 15 * 60_000;
const mem = new Map<string, { exp: number; features: GeoJSON.Feature[] }>();

/** Entités d'une tuile (z,x,y) pour une couche du réseau Enedis ; géométrie seule (aucune donnée nominative). */
export async function enedisFeatures(layer: RemoteLayer, z: number, x: number, y: number): Promise<GeoJSON.Feature[]> {
  const key = `${layer}/${z}/${x}/${y}`;
  const hit = mem.get(key);
  if (hit && hit.exp > Date.now()) return hit.features;
  // Cercle circonscrit à la tuile (rayon = 0,72 × largeur de la tuile) ; les entités hors tuile sont rognées au moment de la découpe MVT.
  const n = 2 ** z;
  const lon = ((x + 0.5) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI;
  const widthM = (40_075_016.686 / n) * Math.cos((lat * Math.PI) / 180);
  const q = new URLSearchParams({ limit: String(LIMIT), where: `within_distance(_geopoint, geom'POINT(${lon.toFixed(6)} ${lat.toFixed(6)})', ${Math.ceil(widthM * 0.72)}m)` });
  const json = await fetchJson<GeoJSON.FeatureCollection>(`${BASE}/${REMOTE_DATASETS[layer]}/exports/geojson?${q}`, { timeoutMs: 25_000 });
  const features = (json.features ?? []).filter((f) => f.geometry).map((f) => ({ type: "Feature" as const, geometry: f.geometry, properties: {} }));
  mem.set(key, { exp: Date.now() + TTL, features });
  if (mem.size > 400) for (const k of [...mem.keys()].slice(0, 100)) mem.delete(k);
  return features;
}
