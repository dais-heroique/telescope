import { z } from "zod";
import { route } from "@/lib/server/api";
import { listSectors, logActivity, newId } from "@/lib/server/crm";
import { run } from "@/lib/server/db";

export const runtime = "nodejs";

export const GET = route({}, async () => ({ sectors: await listSectors() }));

const ring = z.array(z.tuple([z.number(), z.number()])).min(4).max(2000);
const body = z.object({ name: z.string().trim().min(1).max(80), polygon: z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1).max(4) }), assignedTo: z.string().email().nullable().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });
export const POST = route({ body }, async ({ user, body }) => {
  await run("insert into crm_sectors (id, name, polygon, assigned_to, color, created_by) values (?,?,?,?,?,?)", [newId(), body.name, JSON.stringify(body.polygon), body.assignedTo ?? null, body.color ?? "#e8a317", user.email]);
  await logActivity("sector", `a créé le secteur « ${body.name} »`, user.email);
  return { ok: true };
});
