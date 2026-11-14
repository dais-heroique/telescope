import { route } from "@/lib/server/api";
import { query } from "@/lib/server/db";

export const runtime = "nodejs";
export const GET = route({}, async ({ user }) => ({ me: user.email, users: (await query<{ email: string; name: string | null }>("select email, name from users order by email")).map((u) => ({ email: u.email, name: u.name })) }));
