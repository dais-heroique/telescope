import { z } from "zod";
import { route } from "@/lib/server/api";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

const patch = z.object({ name: z.string().trim().min(1).max(160).optional(), kind: z.enum(["proprietaire", "acquereur", "syndic", "notaire", "autre"]).optional(), email: z.string().email().max(200).nullable().optional(), phone: z.string().max(40).nullable().optional(), address: z.string().max(300).nullable().optional(), notes: z.string().max(4000).nullable().optional() });
export const PATCH = route<{ id: string }, z.infer<typeof patch>>({ body: patch }, async ({ params, body }) => {
  const cols = ["name", "kind", "email", "phone", "address", "notes"] as const;
  const sets = cols.filter((c) => body[c] !== undefined);
  if (sets.length) await run(`update crm_contacts set ${sets.map((c) => `${c} = ?`).join(", ")} where id = ?`, [...sets.map((c) => body[c] ?? null), params.id]);
  return { ok: true };
});
export const DELETE = route<{ id: string }>({}, async ({ params }) => {
  await run("delete from crm_contacts where id = ?", [params.id]);
  return { ok: true };
});
