import { z } from "zod";
import { DEFAULT_TEMPLATE } from "@/lib/mail/render";
import { route } from "@/lib/server/api";
import { newId } from "@/lib/server/crm";
import { query, run } from "@/lib/server/db";

export const runtime = "nodejs";

export const GET = route({}, async ({ user }) => {
  let rows = await query<{ id: string; name: string; subject: string | null; body: string }>("select id, name, subject, body from letter_templates order by name");
  if (!rows.length) {
    await run("insert into letter_templates (id, name, subject, body, created_by) values (?,?,?,?,?)", [newId(), DEFAULT_TEMPLATE.name, DEFAULT_TEMPLATE.subject, DEFAULT_TEMPLATE.body, user.email]);
    rows = await query("select id, name, subject, body from letter_templates order by name");
  }
  return { templates: rows };
});

const body = z.object({ name: z.string().trim().min(1).max(100), subject: z.string().max(200).nullable().optional(), body: z.string().min(1).max(8000) });
export const POST = route({ body }, async ({ user, body }) => {
  const id = newId();
  await run("insert into letter_templates (id, name, subject, body, created_by) values (?,?,?,?,?)", [id, body.name, body.subject ?? null, body.body, user.email]);
  return { id };
});
