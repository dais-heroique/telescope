import { normalizeLibsqlUrl } from "@/lib/libsql-url";
import { scopedClient } from "./shards";
import { createClient, type Client, type InValue } from "@libsql/client";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rename, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

declare global {
  var __vigieApp: Client | undefined;
  var __vigieData: Promise<Client> | undefined;
  var __vigieSchema: Promise<void> | undefined;
}

/**
 * Deux bases :
 *  - « application » (utilisateurs, CRM, courriers, cache) : libSQL/Turso en production, fichier SQLite en local. Peu d'écritures.
 *  - « données » (parcelles, ventes, DPE…) : lecture seule. En production, base allégée embarquée dans le déploiement
 *    (data/lite/*.gz, décompressée dans /tmp au démarrage à froid) → aucune écriture ni lecture Turso, aucun quota.
 *    En local, la base complète .data/vigie.db. VIGIE_DATA=turso force la lecture des données dans Turso.
 */
export function db(): Client {
  globalThis.__vigieApp ??= createClient({
    url: normalizeLibsqlUrl(process.env.TURSO_DATABASE_URL),
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return globalThis.__vigieApp;
}

const LITE_DIR = path.join(process.cwd(), "data", "lite");

/** Base allégée embarquée : assemblée une fois par instance dans /tmp, puis ouverte en fichier. */
async function openBundled(): Promise<Client | null> {
  let manifest: { bytes: number; parts: string[]; builtAt: string };
  try {
    manifest = JSON.parse(await readFile(path.join(LITE_DIR, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
  const target = path.join(os.tmpdir(), `vigie-lite-${manifest.builtAt.replace(/\W/g, "")}.db`);
  const ok = await stat(target).then((s) => s.size === manifest.bytes).catch(() => false);
  if (!ok) {
    const tmp = `${target}.${process.pid}.part`;
    const t0 = Date.now();
    const parts = Readable.from((async function* () { for (const f of manifest.parts) yield* createReadStream(path.join(LITE_DIR, f)); })());
    await pipeline(parts, createGunzip(), createWriteStream(tmp));
    await rename(tmp, target);
    console.log(`[db] base allégée prête (${Math.round(manifest.bytes / 1e6)} Mo) en ${Date.now() - t0} ms`);
  }
  return createClient({ url: `file:${target}` });
}

export function dataDb(): Promise<Client> {
  globalThis.__vigieData ??= (async () => {
    const wantBundle = process.env.VIGIE_DATA === "bundle" || (process.env.NODE_ENV === "production" && process.env.VIGIE_DATA !== "turso");
    if (wantBundle) {
      const c = await openBundled();
      if (c) return c;
    }
    return db();
  })().catch((e) => {
    globalThis.__vigieData = undefined;
    throw e;
  });
  return globalThis.__vigieData;
}

export type Row = Record<string, unknown>;

const toRows = <T,>(r: { columns: string[]; rows: ArrayLike<unknown>[] }): T[] =>
  r.rows.map((row) => {
    const o: Row = {};
    r.columns.forEach((c, i) => (o[c] = row[i]));
    return o as T;
  });

/** SELECT sur les données importées (lecture seule) → tableau d'objets. */
export async function query<T = Row>(sql: string, args: InValue[] = []): Promise<T[]> {
  // Portée « morceaux » (withData) si active, sinon base embarquée / locale
  const client = scopedClient() ?? (await dataDb());
  return toRows<T>(await client.execute({ sql, args }));
}

export async function queryOne<T = Row>(sql: string, args: InValue[] = []): Promise<T | null> {
  return (await query<T>(sql, args))[0] ?? null;
}

/** SELECT sur les tables applicatives (utilisateurs, CRM, courriers, cache). */
export async function appQuery<T = Row>(sql: string, args: InValue[] = []): Promise<T[]> {
  await ensureSchema();
  return toRows<T>(await db().execute({ sql, args }));
}

export async function appQueryOne<T = Row>(sql: string, args: InValue[] = []): Promise<T | null> {
  return (await appQuery<T>(sql, args))[0] ?? null;
}

/** Écriture sur les tables applicatives. */
export async function run(sql: string, args: InValue[] = []) {
  await ensureSchema();
  return db().execute({ sql, args });
}

/** Les écritures sont-elles refusées par la base (quota Turso atteint) ? */
export const isWriteBlocked = (e: unknown) => /block|forbidden|quota|upgrade/i.test(e instanceof Error ? e.message : String(e));

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
  id text primary key, name text not null, polygon text not null, assigned_to text, color text not null default '#6d4aff', created_by text, created_at integer not null default (unixepoch())
);
`;

export function ensureSchema(): Promise<void> {
  globalThis.__vigieSchema ??= (async () => {
    // Lecture seule d'abord : si tout existe déjà, aucune écriture n'est tentée
    // (une base dont les écritures sont bloquées doit rester consultable).
    const have = await db().execute("select name from sqlite_master where type='table'");
    const names = new Set(have.rows.map((r) => String(r[0])));
    const wanted = [...APP_SCHEMA.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]!);
    if (wanted.every((n) => names.has(n))) return;
    try {
      await db().executeMultiple(APP_SCHEMA);
    } catch (e) {
      if (/block|forbidden|quota|upgrade/i.test(String(e))) console.error("schema: écritures bloquées, tables applicatives manquantes", String(e));
      else throw e;
    }
  })().catch((e) => {
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
