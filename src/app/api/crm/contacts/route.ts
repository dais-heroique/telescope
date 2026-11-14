import { z } from "zod";
import { route } from "@/lib/server/api";
import { listContacts, newId } from "@/lib/server/crm";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

export const GET = route({}, async () => ({ contacts: await listContacts() }));

const contactBody = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["proprietaire", "acquereur", "syndic", "notaire", "autre"]).default("proprietaire"),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});
export const POST = route({ body: contactBody }, async ({ user, body }) => {
  const id = newId();
  await run("insert into crm_contacts (id, name, kind, email, phone, address, notes, created_by) values (?,?,?,?,?,?,?,?)", [id, body.name, body.kind, body.email ?? null, body.phone ?? null, body.address ?? null, body.notes ?? null, user.email]);
  return { id };
});
