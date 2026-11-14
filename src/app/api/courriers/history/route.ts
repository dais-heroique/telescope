import { route } from "@/lib/server/api";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";

export const GET = route({}, async ({ req }) => {
  const idu = req.nextUrl.searchParams.get("idu");
  const rows = await query<{ id: string; idu: string; recipient: string | null; address: string | null; kind: string; status: string; created_by: string | null; created_at: number; template: string | null }>(
    `select h.id, h.idu, h.recipient, h.address, h.kind, h.status, h.created_by, h.created_at, t.name as template from mail_history h left join letter_templates t on t.id = h.template_id
     ${idu ? "where h.idu = ?" : ""} order by h.created_at desc limit 200`, idu ? [idu] : [],
  );
  return { items: rows };
});
