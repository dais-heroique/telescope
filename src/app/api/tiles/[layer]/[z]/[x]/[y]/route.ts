import { NextResponse, type NextRequest } from "next/server";
import { parseFilters } from "@/lib/filters";
import { getEntitlement } from "@/lib/server/entitlements";
import { getSql } from "@/lib/server/db";
import { MIN_ZOOM, TILE_LAYERS, tileQuery, type TileLayer } from "@/lib/server/tiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY = (headers: HeadersInit) => new NextResponse(null, { status: 204, headers });

/**
 * Tuiles vectorielles (MVT) servies depuis PostGIS : /api/tiles/{couche}/{z}/{x}/{y}.pbf?f=<filtres>
 * Cache CDN Vercel (s-maxage) tant que les tuiles ne dépendent pas de l'abonnement de l'utilisateur.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ layer: string; z: string; x: string; y: string }> }) {
  const { layer, z, x, y } = await ctx.params;
  const zi = Number(z), xi = Number(x), yi = Number(y.replace(/\.pbf$/, ""));
  if (!TILE_LAYERS.includes(layer as TileLayer) || ![zi, xi, yi].every(Number.isInteger) || zi < 0 || zi > 22 || xi < 0 || yi < 0 || xi >= 2 ** zi || yi >= 2 ** zi) {
    return NextResponse.json({ error: "tuile invalide" }, { status: 400 });
  }
  const ent = await getEntitlement();
  const cache = ent.restricted ? "private, max-age=600" : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
  const baseHeaders = { "Cache-Control": cache, "Content-Type": "application/x-protobuf", "Access-Control-Allow-Origin": "*" };

  const sql = getSql();
  if (!sql || zi < MIN_ZOOM[layer as TileLayer] || ent.departments.length === 0) return EMPTY(baseHeaders);

  let filters;
  try {
    filters = parseFilters(req.nextUrl.searchParams.get("f"));
  } catch {
    return NextResponse.json({ error: "filtres invalides" }, { status: 400 });
  }

  try {
    const q = tileQuery(layer as TileLayer, zi, xi, yi, ent.departments, filters);
    const rows = await sql.unsafe<{ mvt: Buffer | null }[]>(q.text, q.params as never[]);
    const mvt = rows[0]?.mvt;
    if (!mvt || mvt.length === 0) return EMPTY(baseHeaders);
    // Pas de gzip manuel : Next supprime l'en-tête Content-Encoding des Route Handlers (send-response.js) ;
    // la compression est laissée au serveur / CDN (cf. docs/decisions.md).
    return new Response(new Uint8Array(mvt), { headers: baseHeaders });
  } catch (e) {
    console.error("tile error", layer, zi, xi, yi, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "erreur serveur" }, { status: 500 });
  }
}
