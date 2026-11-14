import { route } from "@/lib/server/api";
import { dashboard } from "@/lib/server/crm";

export const runtime = "nodejs";
export const GET = route({}, async () => dashboard());
