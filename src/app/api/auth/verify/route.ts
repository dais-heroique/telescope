import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { consumeLoginToken, cookieOptions, SESSION_COOKIE, signSession } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const parsed = z.object({ token: z.string().min(20).max(1000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "lien invalide" }, { status: 400 });
  const email = await consumeLoginToken(parsed.data.token);
  if (!email) return NextResponse.json({ error: "lien expiré ou invalide" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(email), cookieOptions());
  return res;
}
