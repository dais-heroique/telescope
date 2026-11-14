import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/server/api";
import { buildEtude } from "@/lib/server/etude";
import { renderEtudePdf } from "@/lib/server/etude-pdf";
import { getSettings } from "@/lib/server/letters";

export const runtime = "nodejs";
export const maxDuration = 60;

const ring = z.array(z.tuple([z.number(), z.number()])).min(4).max(2000);
const body = z.object({
  insee: z.string().regex(/^(\d{5}|2[AB]\d{3})$/).optional(),
  polygon: z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1).max(4) }).optional(),
  format: z.enum(["json", "pdf"]).default("json"),
});

export const POST = route({ body }, async ({ body }) => {
  const scope = body.insee ? { insee: body.insee } : body.polygon ? { polygon: body.polygon } : null;
  if (!scope) return NextResponse.json({ error: "commune ou zone requise" }, { status: 400 });
  const etude = await buildEtude(scope);
  if (body.format === "json") return etude;
  const pdf = await renderEtudePdf(etude, await getSettings());
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="etude-${body.insee ?? "zone"}.pdf"` } });
});
