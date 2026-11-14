import { z } from "zod";
import { STAGE_KEYS } from "@/lib/crm/types";
import { route } from "@/lib/server/api";
import { leadByIdu, listLeads, logActivity, newId } from "@/lib/server/crm";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

export const GET = route({}, async () => ({ leads: await listLeads() }));

const create = z.object({ idu: z.string().regex(/^[0-9AB]{5}[0-9]{3}[0-9A-Z]{2}[0-9]{4}$/), stage: z.enum(STAGE_KEYS).default("a_prospecter"), title: z.string().max(160).optional(), contactId: z.string().max(40).optional(), assignedTo: z.string().email().optional() });

export const POST = route({ body: create }, async ({ user, body }) => {
  const existing = await leadByIdu(body.idu);
  if (existing) return { lead: existing, created: false };
  const id = newId();
  await run("insert into crm_leads (id, idu, title, stage, contact_id, assigned_to, created_by) values (?,?,?,?,?,?,?)", [id, body.idu, body.title ?? null, body.stage, body.contactId ?? null, body.assignedTo ?? user.email, user.email]);
  await logActivity("lead", `a ajouté la parcelle ${body.idu} au CRM`, user.email, id);
  return { lead: await leadByIdu(body.idu), created: true };
});
