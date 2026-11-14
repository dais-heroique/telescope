import { z } from "zod";
import { route } from "@/lib/server/api";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

const body = z.object({ name: z.string().trim().min(1).max(100), subject: z.string().max(200).nullable().optional(), body: z.string().min(1).max(8000) });
export const PUT = route<{ id: string }, z.infer<typeof body>>({ body }, async ({ params, body }) => {
  await run("update letter_templates set name = ?, subject = ?, body = ?, updated_at = unixepoch() where id = ?", [body.name, body.subject ?? null, body.body, params.id]);
  return { ok: true };
});
export const DELETE = route<{ id: string }>({}, async ({ params }) => {
  await run("delete from letter_templates where id = ?", [params.id]);
  return { ok: true };
});
