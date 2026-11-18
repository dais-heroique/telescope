import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { getUser, type User } from "./auth";
import { isWriteBlocked } from "./db";
import { ScopeTooWide } from "./shards";

type Ctx<P> = { params: Promise<P> };

/**
 * Enrobe un Route Handler : authentification (défense en profondeur après le middleware), validation Zod du corps, gestion d'erreurs.
 */
export function route<P extends Record<string, string> = Record<string, string>, B = undefined>(
  opts: { body?: ZodType<B>; admin?: boolean },
  fn: (a: { req: NextRequest; user: User; params: P; body: B }) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "non authentifié" }, { status: 401 });
    if (opts.admin && !user.isAdmin) return NextResponse.json({ error: "réservé aux administrateurs" }, { status: 403 });
    let body = undefined as B;
    if (opts.body) {
      const parsed = opts.body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return NextResponse.json({ error: "données invalides", details: parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") + ": " + i.message) }, { status: 400 });
      body = parsed.data;
    }
    try {
      const out = await fn({ req, user, params: await ctx.params, body });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof Response) return e;
      if (e instanceof ScopeTooWide) return NextResponse.json({ error: "zone trop large : zoomez ou dessinez une zone plus petite" }, { status: 400 });
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}`, e instanceof Error ? e.message : e);
      if (isWriteBlocked(e)) return NextResponse.json({ error: "Écriture impossible : la base Turso a atteint son quota (écritures bloquées). Lecture seule en attendant." }, { status: 503 });
      return NextResponse.json({ error: "erreur serveur" }, { status: 500 });
    }
  };
}

export const notFound = () => NextResponse.json({ error: "introuvable" }, { status: 404 });
