import { NextResponse, type NextRequest } from "next/server";
import { parseFilters } from "@/lib/filters";
import { ScopeTooWide, tileBBox, withData } from "@/lib/server/shards";
import { MIN_ZOOM, renderTile, TILE_LAYERS, type TileLayer } from "@/lib/server/tiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tuiles vectorielles (MVT) générées depuis libSQL : /api/tiles/{couche}/{z}/{x}/{y}.pbf?f=<filtres>
 * (le middleware authentifie avant le cache CDN ; les données sont des données publiques).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ layer: string; z: string; x: string; y: string }> }) {
  const { layer, z, x, y } = await ctx.params;
  const zi = Number(z), xi = Number(x), yi = Number(y.replace(/\.pbf$/, ""));
  if (!TILE_LAYERS.includes(layer as TileLayer) || ![zi, xi, yi].every(Number.isInteger) || zi < 0 || zi > 22 || xi < 0 || yi < 0 || xi >= 2 ** zi || yi >= 2 ** zi) {
    return NextResponse.json({ error: "tuile invalide" }, { status: 400 });
  }
  const headers = { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400", "Content-Type": "application/x-protobuf" };
  if (zi < MIN_ZOOM[layer as TileLayer]) return new NextResponse(null, { status: 204, headers });

  let filters;
  try {
    filters = parseFilters(req.nextUrl.searchParams.get("f"));
  } catch {
    return NextResponse.json({ error: "filtres invalides" }, { status: 400 });
  }
  try {
    const mvt = await withData({ bbox: tileBBox(zi, xi, yi) }, () => renderTile(layer as TileLayer, zi, xi, yi, filters));
    if (!mvt || mvt.length === 0) return new NextResponse(null, { status: 204, headers });
    return new Response(new Uint8Array(mvt), { headers });
  } catch (e) {
    if (e instanceof ScopeTooWide) return new NextResponse(null, { status: 204, headers });
    console.error("tile error", layer, zi, xi, yi, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "erreur serveur" }, { status: 500 });
  }
}
