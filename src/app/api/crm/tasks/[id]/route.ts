import { z } from "zod";
import { route } from "@/lib/server/api";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

const patch = z.object({ done: z.boolean().optional(), title: z.string().trim().min(1).max(200).optional(), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), assignedTo: z.string().email().nullable().optional() });
export const PATCH = route<{ id: string }, z.infer<typeof patch>>({ body: patch }, async ({ params, body }) => {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (body.done !== undefined) { sets.push("done = ?"); args.push(body.done ? 1 : 0); }
  if (body.title !== undefined) { sets.push("title = ?"); args.push(body.title); }
  if (body.dueAt !== undefined) { sets.push("due_at = ?"); args.push(body.dueAt); }
  if (body.assignedTo !== undefined) { sets.push("assigned_to = ?"); args.push(body.assignedTo); }
  if (sets.length) await run(`update crm_tasks set ${sets.join(", ")} where id = ?`, [...args, params.id]);
  return { ok: true };
});
export const DELETE = route<{ id: string }>({}, async ({ params }) => {
  await run("delete from crm_tasks where id = ?", [params.id]);
  return { ok: true };
});
