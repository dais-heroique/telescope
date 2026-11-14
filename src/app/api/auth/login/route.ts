import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createLoginLink, isAllowedEmail, normalizeEmail, sendLoginEmail } from "@/lib/server/auth";

export const runtime = "nodejs";

const body = z.object({ email: z.string().email().max(200) });

/** Réponse identique que l'email soit autorisé ou non (pas d'énumération des comptes). */
export async function POST(req: NextRequest) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "email invalide" }, { status: 400 });
  const email = normalizeEmail(parsed.data.email);
  try {
    if (await isAllowedEmail(email)) {
      const link = await createLoginLink(email);
      const sent = await sendLoginEmail(email, link);
      if (!sent) console.warn(`[auth] pas d'envoi d'email (RESEND_API_KEY absent ou refus) pour ${email} : lien à transmettre via la page Équipe`);
    }
  } catch (e) {
    console.error("[auth] login", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
