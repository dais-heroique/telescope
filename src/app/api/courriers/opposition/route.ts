import { z } from "zod";
import { addressKey } from "@/lib/mail/render";
import { route } from "@/lib/server/api";
import { appQuery, run } from "@/lib/server/db";

export const runtime = "nodejs";

export const GET = route({}, async () => ({ items: await appQuery<{ key: string; address: string; reason: string | null; created_at: number }>("select key, address, reason, created_at from opposition order by created_at desc") }));

const body = z.object({ address: z.string().trim().min(5).max(300), reason: z.string().max(300).optional() });
export const POST = route({ body }, async ({ user, body }) => {
  await run("insert into opposition (key, address, reason, created_by) values (?,?,?,?) on conflict (key) do nothing", [addressKey(body.address), body.address, body.reason ?? null, user.email]);
  return { ok: true };
});

export const DELETE = route({}, async ({ req }) => {
  const key = req.nextUrl.searchParams.get("key");
  if (key) await run("delete from opposition where key = ?", [key]);
  return { ok: true };
});
