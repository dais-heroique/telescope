/**
 * Données par « morceaux » (shards) : chaque département est publié dans une release GitHub (`data-<dep>`) sous forme de
 * fichiers SQLite compressés en brotli (un par groupe de communes voisines). L'application ne télécharge que les morceaux
 * de la zone regardée, les décompresse dans /tmp et les interroge en lecture seule. Aucune base en ligne, aucun quota.
 *
 *  - DATA_REPO         dépôt GitHub public hébergeant les releases (défaut : dais-heroique/telescope)
 *  - DATA_SHARDS_DIR   dossier local contenant manifest-<dep>.json et les .db.br (développement / tests)
 *  - VIGIE_SHARDS      « 1 » pour activer hors production, « 0 » pour désactiver
 */
import { createClient, type Client } from "@libsql/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import departements from "@/lib/geo/departements.json";

type BBox = [number, number, number, number];
export interface ShardInfo { id: number; file: string; raw: number; size: number; bbox: BBox; communes: { insee: string; bbox: BBox; n: number }[]; }
export interface Manifest { v: number; dep: string; builtAt: string; shards: ShardInfo[]; }

/** Zone trop large : trop de morceaux à lire d'un coup. */
export class ScopeTooWide extends Error {
  constructor() { super("zone trop large"); }
}

export const MAX_SHARDS = 8;
const CACHE_DIR = path.join(os.tmpdir(), "vigie-shards");
const CACHE_MAX_BYTES = 380e6;
const MANIFEST_TTL = 10 * 60_000;
const DEP_MARGIN = 0.25; // les emprises départementales sont dérivées des centres de communes

export const shardsEnabled = () => {
  if (process.env.VIGIE_SHARDS === "0") return false;
  if (process.env.VIGIE_SHARDS === "1" || process.env.DATA_SHARDS_DIR) return true;
  return process.env.NODE_ENV === "production";
};

const repo = () => process.env.DATA_REPO || "dais-heroique/telescope";
export const depOf = (insee: string) => (insee.startsWith("97") ? insee.slice(0, 3) : insee.slice(0, 2));
const inter = (a: BBox, b: BBox, m = 0) => a[0] <= b[2] + m && a[2] >= b[0] - m && a[1] <= b[3] + m && a[3] >= b[1] - m;

/* ───────── manifests ───────── */
const manifests = new Map<string, { at: number; m: Manifest | null; p?: Promise<Manifest | null> }>();

async function loadManifest(dep: string): Promise<Manifest | null> {
  try {
    const dir = process.env.DATA_SHARDS_DIR;
    if (dir) {
      const f = path.join(dir, `manifest-${dep}.json`);
      return existsSync(f) ? (JSON.parse(await readFile(f, "utf8")) as Manifest) : null;
    }
    const res = await fetch(`https://github.com/${repo()}/releases/download/data-${dep}/manifest-${dep}.json`, { signal: AbortSignal.timeout(10_000), redirect: "follow" });
    if (!res.ok) return null;
    return (await res.json()) as Manifest;
  } catch (e) {
    console.warn(`[shards] manifest ${dep} indisponible :`, e instanceof Error ? e.message : e);
    return null;
  }
}

export async function manifestFor(dep: string): Promise<Manifest | null> {
  const c = manifests.get(dep);
  if (c && Date.now() - c.at < (c.m ? MANIFEST_TTL : 2 * 60_000)) return c.p ? c.p : c.m;
  const p = loadManifest(dep);
  manifests.set(dep, { at: Date.now(), m: null, p });
  const m = await p;
  manifests.set(dep, { at: Date.now(), m });
  return m;
}

/* ───────── sélection des morceaux ───────── */
export type ScopeSpec = { bbox?: BBox; insees?: string[]; idus?: string[]; near?: boolean };

export async function pickShards(spec: ScopeSpec): Promise<{ manifest: Manifest; shard: ShardInfo }[]> {
  const out = new Map<string, { manifest: Manifest; shard: ShardInfo }>();
  const add = (manifest: Manifest, shard: ShardInfo) => out.set(`${manifest.dep}-${shard.id}`, { manifest, shard });
  const insees = new Set<string>([...(spec.insees ?? []), ...(spec.idus ?? []).map((i) => i.slice(0, 5))]);
  for (const insee of insees) {
    const m = await manifestFor(depOf(insee));
    if (!m) continue;
    for (const s of m.shards) {
      const c = s.communes.find((x) => x.insee === insee);
      if (!c) continue;
      add(m, s);
      // morceaux voisins (comparables de ventes, bâtiments à cheval sur deux morceaux)
      if (spec.near) for (const o of m.shards) if (o.id !== s.id && o.communes.some((x) => inter(x.bbox, c.bbox, 0.01))) add(m, o);
    }
  }
  if (spec.bbox) {
    const bb = spec.bbox;
    const deps = Object.entries(departements as unknown as Record<string, BBox>).filter(([, b]) => inter(bb, b, DEP_MARGIN)).map(([d]) => d);
    for (const dep of deps) {
      const m = await manifestFor(dep);
      if (!m) continue;
      for (const s of m.shards) if (inter(bb, s.bbox) && s.communes.some((c) => inter(bb, c.bbox))) add(m, s);
    }
  }
  if (out.size > MAX_SHARDS) throw new ScopeTooWide();
  return [...out.values()];
}

/* ───────── téléchargement + décompression dans /tmp ───────── */
const inflight = new Map<string, Promise<string>>();
const inUse = new Set<string>();

function evict(keep: string[]) {
  try {
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".db")).map((f) => ({ f: path.join(CACHE_DIR, f), s: statSync(path.join(CACHE_DIR, f)) }));
    let total = files.reduce((t, x) => t + x.s.size, 0);
    for (const x of files.sort((a, b) => a.s.atimeMs - b.s.atimeMs)) {
      if (total <= CACHE_MAX_BYTES) break;
      if (keep.includes(x.f) || inUse.has(x.f)) continue;
      rmSync(x.f, { force: true });
      total -= x.s.size;
    }
  } catch { /* dossier absent */ }
}

async function ensureShard(manifest: Manifest, shard: ShardInfo): Promise<string> {
  const target = path.join(CACHE_DIR, `${manifest.dep}-${shard.id}-${manifest.builtAt.replace(/\W/g, "")}.db`);
  try {
    if (statSync(target).size === shard.raw) return target;
  } catch { /* à télécharger */ }
  let p = inflight.get(target);
  if (!p) {
    p = (async () => {
      mkdirSync(CACHE_DIR, { recursive: true });
      evict([target]);
      const tmp = `${target}.${process.pid}.${Date.now()}.part`;
      const t0 = Date.now();
      const dir = process.env.DATA_SHARDS_DIR;
      let body: Readable;
      if (dir) body = createReadStream(path.join(dir, shard.file));
      else {
        const res = await fetch(`https://github.com/${repo()}/releases/download/data-${manifest.dep}/${shard.file}`, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
        if (!res.ok || !res.body) throw new Error(`morceau ${shard.file} : HTTP ${res.status}`);
        body = Readable.fromWeb(res.body as never);
      }
      await pipeline(body, createBrotliDecompress(), createWriteStream(tmp));
      renameSync(tmp, target);
      console.log(`[shards] ${shard.file} prêt (${Math.round(shard.raw / 1e6)} Mo) en ${Date.now() - t0} ms`);
      return target;
    })().finally(() => inflight.delete(target));
    inflight.set(target, p);
  }
  return p;
}

/* ───────── connexions (une vue unifiée quand plusieurs morceaux sont lus ensemble) ───────── */
const TABLES = ["parcelles", "idx_parcelles", "batiments", "idx_batiments", "bat_parcelle", "dvf_mutations", "dvf_mutation_parcelles", "dpe", "plu_zones", "idx_plu_zones", "permis", "permis_parcelles", "rnic_copros", "rnic_parcelles", "pm_parcelles", "loyers_communes", "vacance_communes"];
const clients = new Map<string, Client>();

async function clientFor(files: string[]): Promise<Client> {
  const key = files.join("|");
  const hit = clients.get(key);
  if (hit) { clients.delete(key); clients.set(key, hit); return hit; }
  let c: Client;
  if (files.length === 1) c = createClient({ url: `file:${files[0]}` });
  else {
    c = createClient({ url: ":memory:" });
    for (let i = 0; i < files.length; i++) await c.execute(`attach database '${files[i]!.replace(/'/g, "''")}' as s${i}`);
    for (const t of TABLES) {
      await c.execute(`create temp view ${t} as ${files.map((_, i) => `select * from s${i}.${t}`).join(" union all ")}`);
    }
  }
  clients.set(key, c);
  files.forEach((f) => inUse.add(f));
  while (clients.size > 6) {
    const [k, old] = clients.entries().next().value as [string, Client];
    clients.delete(k);
    old.close();
    k.split("|").forEach((f) => { if (![...clients.keys()].some((kk) => kk.split("|").includes(f))) inUse.delete(f); });
  }
  return c;
}

/* ───────── portée de requête ───────── */
const als = new AsyncLocalStorage<{ client: Client | null }>();

/** Client de la portée courante : `undefined` hors portée, `null` si aucune donnée téléchargeable (repli sur la base embarquée). */
export const scopedClient = () => als.getStore()?.client;

/**
 * Exécute `fn` avec les données de la zone demandée : toutes les requêtes `query()` lisent alors les morceaux concernés.
 * Lève ScopeTooWide si la zone recouvre trop de morceaux.
 */
export async function withData<T>(spec: ScopeSpec, fn: () => Promise<T>): Promise<T> {
  if (!shardsEnabled()) return fn();
  const picked = await pickShards(spec);
  if (!picked.length) return als.run({ client: null }, fn);
  const files = await Promise.all(picked.map((p) => ensureShard(p.manifest, p.shard)));
  const now = new Date();
  for (const f of files) { try { utimesSync(f, now, now); } catch { /* ignore */ } }
  const client = await clientFor([...files].sort());
  return als.run({ client }, fn);
}

/** Emprise d'une tuile XYZ. */
export function tileBBox(z: number, x: number, y: number): BBox {
  const n = 2 ** z;
  const lon = (xx: number) => (xx / n) * 360 - 180;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}
