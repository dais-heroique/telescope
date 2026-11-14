import { z } from "zod";
import { route } from "@/lib/server/api";
import { listNotes, logActivity, newId } from "@/lib/server/crm";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

export const GET = route<{ id: string }>({}, async ({ params }) => ({ notes: await listNotes(params.id) }));

const body = z.object({ body: z.string().trim().min(1).max(4000) });
export const POST = route<{ id: string }, z.infer<typeof body>>({ body }, async ({ params, user, body }) => {
  await run("insert into crm_notes (id, lead_id, body, author) values (?,?,?,?)", [newId(), params.id, body.body, user.email]);
  await run("update crm_leads set updated_at = unixepoch() where id = ?", [params.id]);
  await logActivity("note", `a ajouté une note : ${body.body.slice(0, 80)}`, user.email, params.id);
  return { notes: await listNotes(params.id) };
});
