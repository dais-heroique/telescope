import { createClient, type Client, type InValue } from "@libsql/client";

declare global {
  var __vigieDb: Client | undefined;
  var __vigieSchema: Promise<void> | undefined;
}

/**
 * Base de l'application : libSQL (Turso en production, fichier SQLite en local).
 * Contient les données importées (parcelles, ventes, DPE…) ET les tables applicatives (utilisateurs, CRM…).
 */
export function db(): Client {
  globalThis.__vigieDb ??= createClient({
    url: process.env.TURSO_DATABASE_URL || "file:.data/vigie.db",
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return globalThis.__vigieDb;
}

export type Row = Record<string, unknown>;

/** Requête SELECT → tableau d'objets. */
export async function query<T = Row>(sql: string, args: InValue[] = []): Promise<T[]> {
  await ensureSchema();
  const r = await db().execute({ sql, args });
  return r.rows.map((row) => {
    const o: Row = {};
    r.columns.forEach((c, i) => (o[c] = row[i]));
    return o as T;
  });
}

export async function queryOne<T = Row>(sql: string, args: InValue[] = []): Promise<T | null> {
  return (await query<T>(sql, args))[0] ?? null;
}

export async function run(sql: string, args: InValue[] = []) {
  await ensureSchema();
  return db().execute({ sql, args });
}

/** Tables applicatives (créées au besoin ; les tables de données sont créées par l'export). */
const APP_SCHEMA = `
create table if not exists users (
  email text primary key,
  name text,
  is_admin integer not null default 0,
  created_at integer not null default (unixepoch()),
  last_login_at integer
);
create table if not exists login_tokens (
  hash text primary key,
  email text not null,
  expires_at integer not null,
  used_at integer
);
create table if not exists api_cache (
  key text primary key,
  payload text not null,
  expires_at integer not null
);
`;

export function ensureSchema(): Promise<void> {
  globalThis.__vigieSchema ??= db().executeMultiple(APP_SCHEMA).catch((e) => {
    globalThis.__vigieSchema = undefined;
    throw e;
  });
  return globalThis.__vigieSchema;
}

/** Une source de données importée est-elle présente dans la base ? */
export async function hasTable(name: string): Promise<boolean> {
  const r = await queryOne<{ n: number }>("select count(*) n from sqlite_master where type='table' and name = ?", [name]);
  return (r?.n ?? 0) > 0;
}
