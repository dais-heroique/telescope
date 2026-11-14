import { z } from "zod";
import { route } from "@/lib/server/api";
import { listTasks, logActivity, newId } from "@/lib/server/crm";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

export const GET = route({}, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  return { tasks: await listTasks({ assignedTo: sp.get("mine") === "1" ? user.email : undefined, done: sp.has("done") ? sp.get("done") === "1" : undefined, leadId: sp.get("lead") ?? undefined }) };
});

const body = z.object({ title: z.string().trim().min(1).max(200), leadId: z.string().max(40).optional(), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), assignedTo: z.string().email().optional() });
export const POST = route({ body }, async ({ user, body }) => {
  await run("insert into crm_tasks (id, lead_id, title, due_at, assigned_to, created_by) values (?,?,?,?,?,?)", [newId(), body.leadId ?? null, body.title, body.dueAt ?? null, body.assignedTo ?? user.email, user.email]);
  await logActivity("task", `a créé la tâche « ${body.title} »`, user.email, body.leadId ?? null);
  return { ok: true };
});
