import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

export const CACHE_DIR = process.env.INGEST_CACHE_DIR ?? path.resolve(".data");

export function cachePath(...parts: string[]) {
  const p = path.join(CACHE_DIR, ...parts);
  mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Télécharge `url` vers un fichier du cache, avec **reprise** (Range) et nouvelles tentatives :
 * certains proxys/CDN coupent les gros transferts (constaté sur static.data.gouv.fr).
 * Si le fichier existe déjà et est complet, rien n'est retéléchargé.
 */
export async function download(url: string, dest: string, opts: { retries?: number; force?: boolean } = {}): Promise<string> {
  const retries = opts.retries ?? 8;
  let total: number | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const have = existsSync(dest) && !opts.force ? statSync(dest).size : 0;
    if (opts.force && attempt === 0 && existsSync(dest)) (await import("node:fs/promises")).rm(dest);
    try {
      const res = await fetch(url, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, redirect: "follow" });
      if (res.status === 416) return dest; // déjà complet
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status} sur ${url}`);
      const len = Number(res.headers.get("content-length") ?? 0);
      total = res.status === 206 ? have + len : len || null;
      if (res.status === 200 && have > 0) {
        // le serveur ignore Range : on repart de zéro
        await (await import("node:fs/promises")).rm(dest, { force: true });
      }
      const append = res.status === 206;
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest, { flags: append ? "a" : "w" }));
      const size = statSync(dest).size;
      if (total && size < total) throw new Error(`transfert tronqué (${size}/${total} octets)`);
      return dest;
    } catch (e) {
      if (attempt === retries) throw new Error(`échec du téléchargement de ${url} : ${e instanceof Error ? e.message : e}`);
      console.warn(`  ↻ reprise du téléchargement (${attempt + 1}/${retries}) : ${e instanceof Error ? e.message : e}`);
      await sleep(1000 * (attempt + 1));
    }
  }
  return dest;
}

export function openText(file: string) {
  return createReadStream(file);
}

/** GET JSON avec nouvelles tentatives (APIs publiques parfois capricieuses). */
export async function getJson<T = unknown>(url: string, retries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      if (i >= retries) throw new Error(`GET ${url} : ${e instanceof Error ? e.message : e}`);
      await sleep(800 * (i + 1));
    }
  }
}
