import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { adminEmails } from "@/lib/env";
import { createLoginLink, isAllowedEmail, normalizeEmail, sendLoginEmail } from "@/lib/server/auth";

export const runtime = "nodejs";

const body = z.object({ email: z.string().email().max(200), bootstrap: z.string().max(64).optional() });

/** Code d'amorçage du premier accès administrateur : 10 premiers caractères d'AUTH_SECRET (connu de l'hébergeur uniquement). */
function bootstrapOk(code: string | undefined): boolean {
  const secret = process.env.AUTH_SECRET;
  if (!code || !secret || secret.length < 16) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(secret.slice(0, 10));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Réponse identique que l'email soit autorisé ou non (pas d'énumération des comptes). */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "email invalide" }, { status: 400 });
  const email = normalizeEmail(parsed.data.email);
  try {
    if (await isAllowedEmail(email)) {
      const link = await createLoginLink(email);
      // Sans service d'email : le premier administrateur peut obtenir son lien avec le code d'amorçage
      if (adminEmails().includes(email) && bootstrapOk(parsed.data.bootstrap)) return NextResponse.json({ ok: true, link });
      const sent = await sendLoginEmail(email, link);
      if (!sent) console.warn(`[auth] pas d'envoi d'email (RESEND_API_KEY absent ou refus) pour ${email} : lien à transmettre via la page Équipe`);
    }
  } catch (e) {
    console.error("[auth] login", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
