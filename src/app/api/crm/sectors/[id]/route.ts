import { z } from "zod";
import { route } from "@/lib/server/api";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

const patch = z.object({ name: z.string().trim().min(1).max(80).optional(), assignedTo: z.string().email().nullable().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });
export const PATCH = route<{ id: string }, z.infer<typeof patch>>({ body: patch }, async ({ params, body }) => {
  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (body.name !== undefined) { sets.push("name = ?"); args.push(body.name); }
  if (body.assignedTo !== undefined) { sets.push("assigned_to = ?"); args.push(body.assignedTo); }
  if (body.color !== undefined) { sets.push("color = ?"); args.push(body.color); }
  if (sets.length) await run(`update crm_sectors set ${sets.join(", ")} where id = ?`, [...args, params.id]);
  return { ok: true };
});
export const DELETE = route<{ id: string }>({}, async ({ params }) => {
  await run("delete from crm_sectors where id = ?", [params.id]);
  return { ok: true };
});
