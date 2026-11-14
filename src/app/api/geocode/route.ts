import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({ q: z.string().trim().min(2).max(200) });

/** Référence cadastrale : "74010 000 AB 0123", "74010000AB0123", "74010-AB-123"… */
const PARCEL_RE = /^(\d{5}|2[AB]\d{3})[\s-]*(\d{3})?[\s-]*([A-Z0-9]{1,2})[\s-]*0*(\d{1,4})$/i;

export interface GeocodeHit {
  kind: "address" | "municipality" | "parcel";
  label: string;
  context?: string;
  lng: number;
  lat: number;
  zoom: number;
  idu?: string;
  citycode?: string;
}

async function searchParcel(m: RegExpMatchArray): Promise<GeocodeHit[]> {
  const [, insee, comAbs = "000", sectionRaw, numeroRaw] = m;
  const section = sectionRaw.toUpperCase().padStart(2, "0");
  const numero = numeroRaw.padStart(4, "0");
  const url = new URL("https://apicarto.ign.fr/api/cadastre/parcelle");
  url.search = new URLSearchParams({ code_insee: insee.toUpperCase(), section, numero, com_abs: comAbs }).toString();
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] };
  return (json.features ?? []).slice(0, 1).map((f) => {
    const { centroidOf } = coords(f.geometry.coordinates);
    return {
      kind: "parcel" as const,
      label: `Parcelle ${String(f.properties.idu)}`,
      context: `${String(f.properties.nom_com ?? "")} · ${String(f.properties.contenance ?? "?")} m²`,
      lng: centroidOf[0],
      lat: centroidOf[1],
      zoom: 19,
      idu: String(f.properties.idu),
      citycode: insee,
    };
  });
}

/** Centre approximatif (moyenne des sommets) d'une géométrie GeoJSON imbriquée. */
function coords(c: unknown): { centroidOf: [number, number] } {
  let sx = 0,
    sy = 0,
    n = 0;
  const walk = (a: unknown) => {
    if (Array.isArray(a) && typeof a[0] === "number") {
      sx += a[0] as number;
      sy += a[1] as number;
      n++;
    } else if (Array.isArray(a)) a.forEach(walk);
  };
  walk(c);
  return { centroidOf: [sx / n, sy / n] };
}

async function searchAddress(q: string): Promise<GeocodeHit[]> {
  const url = new URL("https://data.geopf.fr/geocodage/search");
  url.search = new URLSearchParams({ q, limit: "7", autocomplete: "1" }).toString();
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    features?: { geometry: { coordinates: [number, number] }; properties: { label: string; context?: string; type: string; citycode?: string } }[];
  };
  return (json.features ?? []).map((f) => ({
    kind: f.properties.type === "municipality" ? ("municipality" as const) : ("address" as const),
    label: f.properties.label,
    context: f.properties.context,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    zoom: f.properties.type === "municipality" ? 13 : f.properties.type === "street" ? 16 : 18,
    citycode: f.properties.citycode,
  }));
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse({ q: req.nextUrl.searchParams.get("q") });
  if (!parsed.success) return NextResponse.json({ hits: [] });
  const q = parsed.data.q;
  try {
    const m = q.match(PARCEL_RE);
    const [parcel, addresses] = await Promise.all([m ? searchParcel(m) : Promise.resolve([]), searchAddress(q)]);
    return NextResponse.json(
      { hits: [...parcel, ...addresses] },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ hits: [], error: "geocoder_unavailable" }, { status: 502 });
  }
}
