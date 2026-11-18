import { route } from "@/lib/server/api";

export const runtime = "nodejs";

/** Accès partagé par code : un seul « utilisateur » (celui de la session). */
export const GET = route({}, async ({ user }) => ({ me: user.email, users: [{ email: user.email, name: user.name }] }));
