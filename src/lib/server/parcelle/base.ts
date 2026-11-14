import { aerialBBox, aerialUrl, bboxCenter, bboxOf, pointInGeometry, type BBox } from "@/lib/parcelle/geo";
import type { ParcelBase } from "@/lib/parcelle/types";
import { parseIdu } from "@/lib/data/parsers";
import { decodeGeom } from "@/lib/geo/codec";
import { cached, fetchJson, soft } from "../cache";
import { queryOne } from "../db";

interface Row {
  idu: string; insee: string; dep: string; section: string; numero: string; contenance: number | null;
  geom: ArrayBuffer; lon: number; lat: number;
}

/** Point intérieur : centre de l'emprise s'il est dans la parcelle, sinon moyenne des sommets du premier anneau. */
function interiorPoint(g: GeoJSON.Geometry, bbox: BBox): [number, number] {
  const c = bboxCenter(bbox);
  if (pointInGeometry(c, g)) return c;
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : [];
  const n = ring.length || 1;
  return [ring.reduce((a, p) => a + p[0], 0) / n, ring.reduce((a, p) => a + p[1], 0) / n];
}

async function liveParcel(p: NonNullable<ReturnType<typeof parseIdu>>, idu: string) {
  const q = new URLSearchParams({ code_insee: p.insee, section: p.section, numero: p.numero, com_abs: p.prefixe });
  const json = await cached(`apicarto:parcelle:${idu}`, 30 * 86400, () =>
    fetchJson<{ features: { geometry: GeoJSON.Geometry; properties: { contenance: number } }[] }>(`https://apicarto.ign.fr/api/cadastre/parcelle?${q}`),
  );
  const f = json.features[0];
  return f ? { geometry: f.geometry, contenance: f.properties.contenance ?? null } : null;
}

/** Adresse la plus proche + nom de commune (géocodage inverse BAN / Géoplateforme). */
async function reverse(lon: number, lat: number) {
  const key = `ban:reverse:${lon.toFixed(5)},${lat.toFixed(5)}`;
  return soft(
    cached(key, 30 * 86400, async () => {
      const j = await fetchJson<{ features: { properties: { label: string; city: string } }[] }>(
        `https://data.geopf.fr/geocodage/reverse?lon=${lon}&lat=${lat}&index=address&limit=1`,
      );
      const p = j.features[0]?.properties;
      return { label: p?.label ?? null, city: p?.city ?? null };
    }),
  );
}

export async function getBase(idu: string): Promise<ParcelBase | null> {
  const p = parseIdu(idu);
  if (!p) return null;
  let geometry: GeoJSON.Geometry | null = null;
  let contenance: number | null = null;
  let mode: ParcelBase["mode"] = "live";
  let centroid: [number, number] | null = null;

  const row = await queryOne<Row>("select idu, insee, dep, section, numero, contenance, geom, lon, lat from parcelles where idu = ?", [idu]).catch(() => null);
  if (row) {
    geometry = decodeGeom(row.geom);
    contenance = row.contenance;
    centroid = [row.lon, row.lat];
    mode = "imported";
  }
  if (!geometry) {
    const live = await liveParcel(p, idu).catch(() => null);
    if (!live) return null;
    geometry = live.geometry;
    contenance = live.contenance;
  }
  const bbox = bboxOf(geometry);
  centroid ??= interiorPoint(geometry, bbox);
  const rev = await reverse(centroid[0], centroid[1]);
  const [lon, lat] = centroid;
  return {
    idu,
    mode,
    insee: p.insee,
    dep: p.dep,
    section: p.section,
    numero: p.numero,
    contenance,
    commune: rev?.city ?? null,
    address: rev?.label ?? null,
    centroid,
    geometry,
    bbox,
    links: {
      streetView: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`,
      googleMaps: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
      geoportail: `https://www.geoportail.gouv.fr/carte?c=${lon},${lat}&z=19&l0=ORTHOIMAGERY.ORTHOPHOTOS::GEOPORTAIL:OGC:WMTS(1)&l1=CADASTRALPARCELS.PARCELLAIRE_EXPRESS::GEOPORTAIL:OGC:WMTS(1)&permalink=yes`,
      aerial: aerialUrl(aerialBBox(bbox)),
    },
  };
}
