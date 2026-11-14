import { route } from "@/lib/server/api";
import { leadByIdu, listNotes, listTasks } from "@/lib/server/crm";

export const runtime = "nodejs";

export const GET = route<{ idu: string }>({}, async ({ params }) => {
  const lead = await leadByIdu(params.idu.toUpperCase());
  return lead ? { lead, notes: await listNotes(lead.id), tasks: await listTasks({ leadId: lead.id }) } : { lead: null, notes: [], tasks: [] };
});
