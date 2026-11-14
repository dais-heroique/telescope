import { z } from "zod";
import { route } from "@/lib/server/api";
import { getSettings, saveSettings } from "@/lib/server/letters";

export const runtime = "nodejs";

export const GET = route({}, async () => ({ settings: await getSettings() }));

const body = z.object({
  agence: z.string().max(120), agent: z.string().max(120), signature: z.string().max(600), expediteur: z.string().max(400),
  logo: z.string().regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/).max(420_000).nullable(),
});
export const PUT = route({ body }, async ({ body }) => {
  await saveSettings(body);
  return { ok: true };
});
