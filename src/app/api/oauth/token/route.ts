import { NextResponse, type NextRequest } from "next/server";
import { token } from "@/lib/server/mcp/oauth";

export const runtime = "nodejs";

/** Échange du code d'autorisation (ou renouvellement) contre des jetons. Formulaire x-www-form-urlencoded ou JSON. */
export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  let params: Record<string, string> = {};
  if (ct.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    params = Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } else {
    params = Object.fromEntries([...(await req.formData().catch(() => new FormData())).entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  const out = await token(params);
  return NextResponse.json(out.body, { status: out.status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
