import { z } from "zod";
import { STAGE_KEYS, STAGES } from "@/lib/crm/types";
import { notFound, route } from "@/lib/server/api";
import { logActivity } from "@/lib/server/crm";
import { appQueryOne, run } from "@/lib/server/db";

export const runtime = "nodejs";

const patch = z.object({ stage: z.enum(STAGE_KEYS).optional(), title: z.string().max(160).nullable().optional(), contactId: z.string().max(40).nullable().optional(), assignedTo: z.string().email().nullable().optional(), value: z.number().min(0).nullable().optional() });

export const PATCH = route<{ id: string }, z.infer<typeof patch>>({ body: patch }, async ({ params, user, body }) => {
  const cur = await appQueryOne<{ stage: string; idu: string }>("select stage, idu from crm_leads where id = ?", [params.id]);
  if (!cur) return notFound();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const col = { stage: "stage", title: "title", contactId: "contact_id", assignedTo: "assigned_to", value: "value" } as const;
  for (const [k, c] of Object.entries(col)) {
    const v = body[k as keyof typeof col];
    if (v !== undefined) { sets.push(`${c} = ?`); args.push(v as string | number | null); }
  }
  if (!sets.length) return { ok: true };
  await run(`update crm_leads set ${sets.join(", ")}, updated_at = unixepoch() where id = ?`, [...args, params.id]);
  if (body.stage && body.stage !== cur.stage) await logActivity("stage", `a déplacé ${cur.idu} vers « ${STAGES.find((s) => s.key === body.stage)?.label} »`, user.email, params.id);
  return { ok: true };
});

export const DELETE = route<{ id: string }>({}, async ({ params, user }) => {
  const cur = await appQueryOne<{ idu: string }>("select idu from crm_leads where id = ?", [params.id]);
  if (!cur) return notFound();
  await run("delete from crm_leads where id = ?", [params.id]);
  await logActivity("lead", `a retiré ${cur.idu} du CRM`, user.email);
  return { ok: true };
});
