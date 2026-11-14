import { haversine } from "@/lib/parcelle/geo";
import type { EnvReport, ParcelBase } from "@/lib/parcelle/types";
import { cached } from "../cache";

const CATS: { key: string; label: string; filter: string }[] = [
  { key: "ecoles", label: "Écoles", filter: `["amenity"~"^(school|kindergarten)$"]` },
  { key: "commerces", label: "Commerces alimentaires", filter: `["shop"~"^(supermarket|convenience|bakery|butcher|greengrocer)$"]` },
  { key: "sante", label: "Santé", filter: `["amenity"~"^(doctors|pharmacy|hospital|clinic)$"]` },
  { key: "transports", label: "Transports", filter: `["public_transport"~"^(stop_position|station)$"]` },
];

interface Osm { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }

/** Agrège une réponse Overpass par catégorie (pure, testée). */
export function summarizeOverpass(center: [number, number], sets: { key: string; label: string; osm: Osm }[]): EnvReport["categories"] {
  return sets.map(({ key, label, osm }) => {
    const pts = osm.elements
      .map((e) => ({ name: e.tags?.name ?? null, lon: e.lon ?? e.center?.lon, lat: e.lat ?? e.center?.lat }))
      .filter((p): p is { name: string | null; lon: number; lat: number } => typeof p.lon === "number" && typeof p.lat === "number")
      .map((p) => ({ name: p.name, distance: Math.round(haversine(center, [p.lon, p.lat])) }))
      .sort((a, b) => a.distance - b.distance);
    return { key, label, count: pts.length, nearest: pts[0] ?? null };
  });
}

/** Équipements autour du bien via OpenStreetMap (Overpass, ODbL). Dégrade proprement si le service est indisponible. */
export async function getEnvironnement(base: ParcelBase, radius = 800): Promise<EnvReport> {
  const [lon, lat] = base.centroid;
  const url = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
  try {
    const sets = await cached(`overpass:${lon.toFixed(4)},${lat.toFixed(4)}:${radius}`, 14 * 86400, async () => {
      const q = `[out:json][timeout:15];(${CATS.map((c) => `nwr(around:${radius},${lat},${lon})${c.filter};`).join("")});out center tags;`;
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const all = (await res.json()) as Osm;
      // on répartit les éléments par catégorie d'après leurs tags
      const match = (c: (typeof CATS)[number], t: Record<string, string> = {}) => {
        const m = c.filter.match(/\["(\w+)"~"\^\((.+)\)\$"\]/);
        return m ? new RegExp(`^(${m[2]})$`).test(t[m[1]] ?? "") : false;
      };
      return CATS.map((c) => ({ key: c.key, label: c.label, osm: { elements: all.elements.filter((e) => match(c, e.tags)) } }));
    });
    return { available: true, radius, categories: summarizeOverpass(base.centroid, sets) };
  } catch {
    return { available: false, radius, categories: [] };
  }
}
