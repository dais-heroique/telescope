import { NextResponse, type NextRequest } from "next/server";
import { authorize, type AuthorizeInput } from "@/lib/server/mcp/oauth";

export const runtime = "nodejs";

/** Reçoit le formulaire de la page d'autorisation (code d'accès saisi) ; répond par l'adresse de retour vers Claude. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as AuthorizeInput | null;
  if (!body) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const out = await authorize(body, ip);
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ redirectTo: out.redirectTo });
}
