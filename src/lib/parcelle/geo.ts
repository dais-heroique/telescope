/** Utilitaires géographiques purs (partagés client/serveur, testés). */

export type BBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

/** Emprise de la vignette aérienne : centrée sur la parcelle, ratio w:h respecté en mètres, marge de 40 %. */
export function aerialBBox(parcel: BBox, w = 640, h = 400, minHalfHeightM = 40): BBox {
  const lat = (parcel[1] + parcel[3]) / 2;
  const lon = (parcel[0] + parcel[2]) / 2;
  const kLon = 111320 * Math.cos((lat * Math.PI) / 180);
  const kLat = 110574;
  const wM = (parcel[2] - parcel[0]) * kLon;
  const hM = (parcel[3] - parcel[1]) * kLat;
  const halfH = Math.max(minHalfHeightM, (hM * 1.4) / 2, ((wM * 1.4) / 2) * (h / w));
  const halfW = halfH * (w / h);
  return [lon - halfW / kLon, lat - halfH / kLat, lon + halfW / kLon, lat + halfH / kLat];
}

/** Vignette orthophoto IGN (WMS Géoplateforme) pour une emprise donnée. */
export function aerialUrl(bbox: BBox, w = 640, h = 400): string {
  // WMS 1.3.0 + EPSG:4326 : ordre des axes lat,lon
  const q = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap", LAYERS: "ORTHOIMAGERY.ORTHOPHOTOS", STYLES: "", CRS: "EPSG:4326",
    BBOX: `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`, WIDTH: String(w), HEIGHT: String(h), FORMAT: "image/jpeg",
  });
  return `https://data.geopf.fr/wms-r/wms?${q}`;
}

/** Projette les anneaux d'un (Multi)Polygon dans le repère pixel d'une vignette (pour superposer le contour en SVG). */
export function projectRings(geometry: GeoJSON.Geometry | null, bbox: BBox, w: number, h: number): string[] {
  if (!geometry) return [];
  const rings: number[][][] =
    geometry.type === "Polygon" ? geometry.coordinates : geometry.type === "MultiPolygon" ? geometry.coordinates.flat() : [];
  return rings.map(
    (ring) =>
      ring
        .map(([lon, lat], i) => `${i ? "L" : "M"}${(((lon - bbox[0]) / (bbox[2] - bbox[0])) * w).toFixed(1)},${(((bbox[3] - lat) / (bbox[3] - bbox[1])) * h).toFixed(1)}`)
        .join("") + "Z",
  );
}

/** Distance haversine en mètres. */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bboxOf(geometry: GeoJSON.Geometry): BBox {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1] as number); maxY = Math.max(maxY, c[1] as number);
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk((geometry as { coordinates?: unknown }).coordinates);
  return [minX, minY, maxX, maxY];
}

/** Point dans polygone (ray casting, anneau extérieur + trous) pour Polygon/MultiPolygon. */
export function pointInGeometry(pt: [number, number], g: GeoJSON.Geometry): boolean {
  const inRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const inPoly = (rings: number[][][]) => inRing(rings[0]) && !rings.slice(1).some(inRing);
  if (g.type === "Polygon") return inPoly(g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some(inPoly);
  return false;
}

/** Centre d'une emprise. */
export function bboxCenter(b: BBox): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}
