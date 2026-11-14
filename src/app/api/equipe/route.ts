import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createLoginLink, listUsers, normalizeEmail, requireAdmin, sendLoginEmail } from "@/lib/server/auth";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

const wrap = async (fn: () => Promise<Response>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return NextResponse.json({ error: "erreur serveur" }, { status: 500 });
  }
};

export const GET = () => wrap(async () => {
  await requireAdmin();
  return NextResponse.json({ users: await listUsers() });
});

/** Invite un utilisateur (ou régénère son lien) : renvoie le lien à transmettre si l'email n'a pas pu partir. */
export const POST = (req: NextRequest) => wrap(async () => {
  await requireAdmin();
  const body = z.object({ email: z.string().email().max(200), name: z.string().max(80).optional() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "email invalide" }, { status: 400 });
  const email = normalizeEmail(body.data.email);
  await run("insert into users (email, name) values (?, ?) on conflict (email) do update set name = coalesce(excluded.name, name)", [email, body.data.name ?? null]);
  const link = await createLoginLink(email);
  const emailed = await sendLoginEmail(email, link);
  return NextResponse.json({ link, emailed });
});

export const DELETE = (req: NextRequest) => wrap(async () => {
  const me = await requireAdmin();
  const email = normalizeEmail(req.nextUrl.searchParams.get("email") ?? "");
  if (!email || email === me.email) return NextResponse.json({ error: "suppression impossible" }, { status: 400 });
  await run("delete from users where email = ?", [email]);
  return NextResponse.json({ ok: true });
});
