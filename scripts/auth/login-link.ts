/**
 * Génère un lien de connexion (20 min, usage unique) pour un email, en créant l'utilisateur au besoin.
 *   npm run login-link -- --email=moi@exemple.fr [--admin]
 * Sert à amorcer le premier administrateur (ou dépanner quand l'envoi d'email n'est pas configuré).
 */
import "dotenv/config";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@libsql/client";
import { normalizeLibsqlUrl } from "../../src/lib/libsql-url";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const email = (arg("email") ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("--email=adresse@exemple.fr requis");
const admin = process.argv.includes("--admin");
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function main() {
  const db = createClient({ url: normalizeLibsqlUrl(process.env.TURSO_DATABASE_URL), authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  await db.executeMultiple(`
  create table if not exists users (email text primary key, name text, is_admin integer not null default 0, created_at integer not null default (unixepoch()), last_login_at integer);
  create table if not exists login_tokens (hash text primary key, email text not null, expires_at integer not null, used_at integer);`);
  await db.execute({ sql: "insert into users (email, is_admin) values (?, ?) on conflict (email) do update set is_admin = max(is_admin, excluded.is_admin)", args: [email, admin ? 1 : 0] });
  const token = randomBytes(32).toString("base64url");
  await db.execute({ sql: "insert into login_tokens (hash, email, expires_at) values (?, ?, unixepoch() + 1200)", args: [createHash("sha256").update(token).digest("hex"), email] });
  console.log(`${site}/auth/verify?token=${token}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
