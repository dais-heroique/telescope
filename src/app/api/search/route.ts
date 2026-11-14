import { NextResponse, type NextRequest } from "next/server";
import { searchParcels, searchSchema } from "@/lib/server/search";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const parsed = searchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "paramètres invalides" }, { status: 400 });
  try {
    const res = await searchParcels(parsed.data);
    return NextResponse.json({ ...res, rows: res.rows.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit), offset: parsed.data.offset });
  } catch (e) {
    console.error("search", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "erreur serveur" }, { status: 500 });
  }
}
