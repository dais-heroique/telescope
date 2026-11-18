import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getBase } from "@/lib/server/parcelle/base";
import { withData } from "@/lib/server/shards";
import { getBati } from "@/lib/server/parcelle/bati";
import { getEnergie } from "@/lib/server/parcelle/energie";
import { getEntreprise } from "@/lib/server/parcelle/entreprise";
import { getEnvironnement } from "@/lib/server/parcelle/environnement";
import { getLoyers } from "@/lib/server/parcelle/loyers";
import { getProprietaire } from "@/lib/server/parcelle/proprietaire";
import { getRisques } from "@/lib/server/parcelle/risques";
import { getSynthese } from "@/lib/server/parcelle/synthese";
import { getUrbanisme } from "@/lib/server/parcelle/urbanisme";
import { getVentes } from "@/lib/server/parcelle/ventes";

export const runtime = "nodejs";
export const maxDuration = 30;

const SECTIONS = ["synthese", "bati", "ventes", "energie", "urbanisme", "proprietaire", "risques", "loyers", "environnement", "entreprise"] as const;
type Section = (typeof SECTIONS)[number];

const params = z.object({
  radius: z.coerce.number().min(50).max(3000).default(500),
  type: z.enum(["Maison", "Appartement", "Local industriel. commercial ou assimilé"]).optional(),
  surface: z.coerce.number().min(5).max(5000).optional(),
  bien: z.enum(["appartement", "maison"]).optional(),
  prix: z.coerce.number().min(1).optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ idu: string; section: string }> }) {
  const { idu, section } = await ctx.params;
  if (!SECTIONS.includes(section as Section)) return NextResponse.json({ error: "section inconnue" }, { status: 404 });
  const q = params.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "paramètres invalides" }, { status: 400 });
  try {
    return await withData({ idus: [idu.toUpperCase()], near: true }, async () => {
    const base = await getBase(idu.toUpperCase());
    if (!base) return NextResponse.json({ error: "parcelle introuvable" }, { status: 404 });
    const data = await {
      synthese: () => getSynthese(base),
      bati: () => getBati(base),
      ventes: () => getVentes(base, q.data.radius, q.data.type),
      energie: () => getEnergie(base),
      urbanisme: () => getUrbanisme(base),
      proprietaire: () => getProprietaire(base),
      risques: () => getRisques(base),
      loyers: () => getLoyers(base, { surface: q.data.surface, type: q.data.bien, prix: q.data.prix }),
      environnement: () => getEnvironnement(base, q.data.radius),
      entreprise: () => getEntreprise(base),
    }[section as Section]();
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=120" } });
    });
  } catch (e) {
    console.error("parcelle", section, idu, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "erreur serveur" }, { status: 500 });
  }
}
