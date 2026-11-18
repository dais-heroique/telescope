import { randomUUID } from "node:crypto";
import type { Activity, Contact, Lead, Note, Sector, StageKey, Task } from "@/lib/crm/types";
import { appQuery, appQueryOne, query, run } from "./db";
import { withData } from "./shards";

export const newId = () => randomUUID().replace(/-/g, "").slice(0, 16);

export async function logActivity(kind: string, text: string, author: string, leadId: string | null = null) {
  await run("insert into crm_activity (lead_id, kind, text, author) values (?, ?, ?, ?)", [leadId, kind, text, author]);
}

type LeadRow = {
  id: string; idu: string; title: string | null; stage: StageKey; contact_id: string | null; contact_name: string | null; assigned_to: string | null;
  value: number | null; updated_at: number; adresse: string | null; score: number | null; contenance: number | null; lon: number | null; lat: number | null; nb_tasks: number;
};
const LEAD_SELECT = `select l.id, l.idu, l.title, l.stage, l.contact_id, c.name as contact_name, l.assigned_to, l.value, l.updated_at,
    null as adresse, null as score, null as contenance, null as lon, null as lat, (select count(*) from crm_tasks t where t.lead_id = l.id and t.done = 0) as nb_tasks
  from crm_leads l left join crm_contacts c on c.id = l.contact_id`;

/** Complète les leads avec les infos parcelle (base de données en lecture seule, distincte de la base applicative). */
async function withParcels(rows: LeadRow[]): Promise<LeadRow[]> {
  const idus = [...new Set(rows.map((r) => r.idu))];
  if (!idus.length) return rows;
  try {
    const found = new Map<string, Pick<LeadRow, "adresse" | "score" | "contenance" | "lon" | "lat">>();
    await withData({ idus }, async () => {
      for (let i = 0; i < idus.length; i += 400) {
        const chunk = idus.slice(i, i + 400);
        for (const p of await query<{ idu: string } & Pick<LeadRow, "adresse" | "score" | "contenance" | "lon" | "lat">>(
          `select idu, adresse, score, contenance, lon, lat from parcelles where idu in (${chunk.map(() => "?").join(",")})`, chunk,
        )) found.set(p.idu, p);
      }
    });
    return rows.map((r) => ({ ...r, ...(found.get(r.idu) ?? {}) }));
  } catch {
    return rows; // parcelle absente de la base embarquée : le CRM reste utilisable
  }
}
const toLead = (r: LeadRow): Lead => ({
  id: r.id, idu: r.idu, title: r.title, stage: r.stage, contactId: r.contact_id, contactName: r.contact_name, assignedTo: r.assigned_to, value: r.value,
  updatedAt: r.updated_at, adresse: r.adresse, score: r.score, contenance: r.contenance, lon: r.lon, lat: r.lat, nbTasks: Number(r.nb_tasks),
});

export async function listLeads(): Promise<Lead[]> {
  const rows = await appQuery<LeadRow>(`${LEAD_SELECT} order by l.sort, l.updated_at desc`);
  return (await withParcels(rows)).map(toLead);
}

export async function leadByIdu(idu: string): Promise<Lead | null> {
  const r = await appQueryOne<LeadRow>(`${LEAD_SELECT} where l.idu = ?`, [idu]).catch(() => null);
  return r ? toLead((await withParcels([r]))[0]!) : null;
}

export async function listTasks(opts: { assignedTo?: string; done?: boolean; leadId?: string } = {}): Promise<Task[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.assignedTo) { where.push("t.assigned_to = ?"); args.push(opts.assignedTo); }
  if (opts.done !== undefined) { where.push("t.done = ?"); args.push(opts.done ? 1 : 0); }
  if (opts.leadId) { where.push("t.lead_id = ?"); args.push(opts.leadId); }
  const rows = await appQuery<{ id: string; lead_id: string | null; lead_title: string | null; idu: string | null; title: string; due_at: string | null; done: number; assigned_to: string | null }>(
    `select t.id, t.lead_id, l.title as lead_title, l.idu, t.title, t.due_at, t.done, t.assigned_to from crm_tasks t left join crm_leads l on l.id = t.lead_id
     ${where.length ? "where " + where.join(" and ") : ""} order by t.done, t.due_at is null, t.due_at limit 500`, args,
  );
  return rows.map((r) => ({ id: r.id, leadId: r.lead_id, leadTitle: r.lead_title, leadIdu: r.idu, title: r.title, dueAt: r.due_at, done: Boolean(r.done), assignedTo: r.assigned_to }));
}

export async function listNotes(leadId: string): Promise<Note[]> {
  const rows = await appQuery<{ id: string; body: string; author: string | null; created_at: number }>("select id, body, author, created_at from crm_notes where lead_id = ? order by created_at desc", [leadId]);
  return rows.map((r) => ({ id: r.id, body: r.body, author: r.author, createdAt: r.created_at }));
}

export async function listContacts(): Promise<Contact[]> {
  const rows = await appQuery<{ id: string; name: string; kind: string; email: string | null; phone: string | null; address: string | null; notes: string | null; n: number }>(
    "select c.id, c.name, c.kind, c.email, c.phone, c.address, c.notes, (select count(*) from crm_leads l where l.contact_id = c.id) as n from crm_contacts c order by c.name",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, email: r.email, phone: r.phone, address: r.address, notes: r.notes, nbLeads: Number(r.n) }));
}

export async function listSectors(): Promise<Sector[]> {
  const rows = await appQuery<{ id: string; name: string; polygon: string; assigned_to: string | null; color: string }>("select id, name, polygon, assigned_to, color from crm_sectors order by name");
  return rows.map((r) => ({ id: r.id, name: r.name, polygon: JSON.parse(r.polygon), assignedTo: r.assigned_to, color: r.color }));
}

export async function recentActivity(limit = 30): Promise<Activity[]> {
  const rows = await appQuery<{ id: number; lead_id: string | null; kind: string; text: string; author: string | null; at: number }>("select id, lead_id, kind, text, author, at from crm_activity order by at desc, id desc limit ?", [limit]);
  return rows.map((r) => ({ id: r.id, leadId: r.lead_id, kind: r.kind, text: r.text, author: r.author, at: r.at }));
}

export async function dashboard() {
  const byStage = await appQuery<{ stage: string; n: number }>("select stage, count(*) n from crm_leads group by stage");
  const byAgent = await appQuery<{ assigned_to: string | null; n: number; won: number }>("select assigned_to, count(*) n, sum(stage = 'vendu') won from crm_leads group by assigned_to");
  const tasks = await appQueryOne<{ open: number; overdue: number }>("select sum(done = 0) open, sum(done = 0 and due_at is not null and due_at < date('now')) overdue from crm_tasks");
  return {
    byStage: Object.fromEntries(byStage.map((r) => [r.stage, Number(r.n)])),
    byAgent: byAgent.map((r) => ({ agent: r.assigned_to, leads: Number(r.n), won: Number(r.won ?? 0) })),
    tasks: { open: Number(tasks?.open ?? 0), overdue: Number(tasks?.overdue ?? 0) },
    activity: await recentActivity(25),
  };
}
