import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accessCodeOk, ACCESS_USER, cookieOptions, SESSION_COOKIE, signSession } from "@/lib/server/auth";

export const runtime = "nodejs";

const body = z.object({ code: z.string().min(1).max(64) });

// Limite les essais (par instance serveur) : 8 erreurs par 10 minutes et par adresse IP.
const fails = new Map<string, { n: number; reset: number }>();
const WINDOW = 10 * 60_000;
const MAX_FAILS = 8;

/** Connexion par code d'accès unique (ACCESS_CODE, 7454 par défaut). */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "code requis" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const now = Date.now();
  const f = fails.get(ip);
  if (f && f.reset > now && f.n >= MAX_FAILS) return NextResponse.json({ error: "Trop d'essais, réessayez dans quelques minutes." }, { status: 429 });
  if (!accessCodeOk(parsed.data.code.trim())) {
    fails.set(ip, f && f.reset > now ? { n: f.n + 1, reset: f.reset } : { n: 1, reset: now + WINDOW });
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ error: "Code incorrect" }, { status: 401 });
  }
  fails.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(ACCESS_USER), cookieOptions());
  return res;
}
