import { NextResponse } from "next/server";
import { getBase } from "@/lib/server/parcelle/base";
import { withData } from "@/lib/server/shards";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ idu: string }> }) {
  const { idu } = await ctx.params;
  try {
    const base = await withData({ idus: [idu.toUpperCase()], near: true }, () => getBase(idu.toUpperCase()));
    if (!base) return NextResponse.json({ error: "parcelle introuvable" }, { status: 404 });
    return NextResponse.json(base, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    console.error("parcelle base", idu, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "erreur serveur" }, { status: 500 });
  }
}
