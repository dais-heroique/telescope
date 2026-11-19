import { NextResponse, type NextRequest } from "next/server";
import { bearerOk, originOf } from "@/lib/server/mcp/oauth";
import { handleMessage } from "@/lib/server/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Réponse 401 qui indique à Claude où s'authentifier (métadonnées OAuth de la ressource protégée, RFC 9728). */
function unauthorized(origin: string) {
  return new NextResponse(JSON.stringify({ error: "non autorisé" }), {
    status: 401,
    headers: { "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"` },
  });
}

/** Connecteur Claude (MCP, Streamable HTTP sans état) : un message JSON-RPC (ou un lot) par requête POST. */
export async function POST(req: NextRequest) {
  const origin = originOf(req);
  if (!(await bearerOk(req))) return unauthorized(origin);
  const body = await req.json().catch(() => null);
  if (body === null) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } }, { status: 400 });
  const ctx = { origin };
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handleMessage(m, ctx)))).filter((r) => r !== null);
    return replies.length ? NextResponse.json(replies) : new NextResponse(null, { status: 202 });
  }
  const reply = await handleMessage(body, ctx);
  return reply ? NextResponse.json(reply) : new NextResponse(null, { status: 202 });
}

/** Pas de flux serveur → client : GET non pris en charge (autorisé par la spécification). */
export async function GET(req: NextRequest) {
  if (!(await bearerOk(req))) return unauthorized(originOf(req));
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

/** Sessions sans état : rien à fermer. */
export async function DELETE(req: NextRequest) {
  if (!(await bearerOk(req))) return unauthorized(originOf(req));
  return new NextResponse(null, { status: 204 });
}
