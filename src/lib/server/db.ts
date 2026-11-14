import { normalizeLibsqlUrl } from "@/lib/libsql-url";
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
    url: normalizeLibsqlUrl(process.env.TURSO_DATABASE_URL),
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

-- CRM partagé (une seule organisation : tous les membres voient les mêmes données)
create table if not exists crm_contacts (
  id text primary key, name text not null, kind text not null default 'proprietaire', email text, phone text, address text, notes text,
  created_by text, created_at integer not null default (unixepoch())
);
create table if not exists crm_leads (
  id text primary key, idu text not null unique, title text, stage text not null default 'a_prospecter', contact_id text references crm_contacts(id) on delete set null,
  assigned_to text, value real, sort integer not null default 0, created_by text, created_at integer not null default (unixepoch()), updated_at integer not null default (unixepoch())
);
create index if not exists crm_leads_stage on crm_leads (stage, sort);
create table if not exists crm_tasks (
  id text primary key, lead_id text references crm_leads(id) on delete cascade, title text not null, due_at text, done integer not null default 0,
  assigned_to text, created_by text, created_at integer not null default (unixepoch())
);
create index if not exists crm_tasks_due on crm_tasks (done, due_at);
create table if not exists crm_notes (
  id text primary key, lead_id text not null references crm_leads(id) on delete cascade, body text not null, author text, created_at integer not null default (unixepoch())
);
create table if not exists crm_activity (
  id integer primary key autoincrement, lead_id text, kind text not null, text text not null, author text, at integer not null default (unixepoch())
);
create index if not exists crm_activity_at on crm_activity (at desc);
create table if not exists letter_templates (
  id text primary key, name text not null, subject text, body text not null, created_by text, updated_at integer not null default (unixepoch())
);
create table if not exists mail_history (
  id text primary key, batch_id text, idu text not null, template_id text, recipient text, address text, kind text not null, status text not null default 'generated',
  created_by text, created_at integer not null default (unixepoch())
);
create index if not exists mail_history_idu on mail_history (idu, created_at desc);
create table if not exists opposition (
  key text primary key, address text not null, reason text, created_by text, created_at integer not null default (unixepoch())
);
create table if not exists settings (key text primary key, value text not null);
create table if not exists crm_sectors (
  id text primary key, name text not null, polygon text not null, assigned_to text, color text not null default '#e8a317', created_by text, created_at integer not null default (unixepoch())
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
