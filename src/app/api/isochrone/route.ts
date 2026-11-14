import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cached, fetchJson } from "@/lib/server/cache";

export const runtime = "nodejs";

const q = z.object({
  lon: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  mode: z.enum(["pedestrian", "car"]).default("pedestrian"),
  minutes: z.coerce.number().int().min(1).max(60).default(10),
});

/** Isochrone (IGN Géoplateforme, ressource bdtopo-valhalla) → polygone GeoJSON. */
export async function GET(req: NextRequest) {
  const p = q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!p.success) return NextResponse.json({ error: "paramètres invalides" }, { status: 400 });
  const { lon, lat, mode, minutes } = p.data;
  try {
    const geometry = await cached(`iso:${lon.toFixed(4)},${lat.toFixed(4)}:${mode}:${minutes}`, 30 * 86400, async () => {
      const params = new URLSearchParams({ point: `${lon},${lat}`, resource: "bdtopo-valhalla", costValue: String(minutes * 60), costType: "time", profile: mode, direction: "departure", geometryFormat: "geojson" });
      const j = await fetchJson<{ geometry: GeoJSON.Polygon }>(`https://data.geopf.fr/navigation/isochrone?${params}`, { timeoutMs: 15000 });
      return j.geometry;
    });
    return NextResponse.json({ geometry });
  } catch {
    return NextResponse.json({ error: "isochrone indisponible" }, { status: 502 });
  }
}
