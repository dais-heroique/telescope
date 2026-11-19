import { NextResponse, type NextRequest } from "next/server";
import { registerClient } from "@/lib/server/mcp/oauth";

export const runtime = "nodejs";

/** Enregistrement dynamique du client OAuth (RFC 7591). */
export async function POST(req: NextRequest) {
  const out = await registerClient(await req.json().catch(() => null));
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json(out, { status: 201 });
}
