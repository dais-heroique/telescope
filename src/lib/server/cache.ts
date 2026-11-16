import { appQuery, run } from "./db";

const mem = new Map<string, { exp: number; v: unknown }>();

/**
 * Cache des APIs publiques (mode « à la demande ») : mémoire du processus + table `api_cache`.
 * TTL en secondes. Les échecs de chargement ne sont jamais mis en cache.
 */
export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const m = mem.get(key);
  if (m && m.exp > now) return m.v as T;
  try {
    const rows = await appQuery<{ payload: string }>("select payload from api_cache where key = ? and expires_at > unixepoch()", [key]);
    if (rows[0]) {
      const v = JSON.parse(rows[0].payload) as T;
      mem.set(key, { exp: now + Math.min(ttlSec, 300) * 1000, v });
      return v;
    }
  } catch {
    /* base indisponible : on continue sans cache persistant */
  }
  const v = await load();
  mem.set(key, { exp: now + ttlSec * 1000, v });
  try {
    const payload = JSON.stringify(v);
    if (payload.length < 2_000_000) {
      await run("insert into api_cache (key, payload, expires_at) values (?, ?, unixepoch() + ?) on conflict (key) do update set payload = excluded.payload, expires_at = excluded.expires_at", [key, payload, ttlSec]);
    }
  } catch {
    /* non bloquant */
  }
  return v;
}

/** fetch JSON avec délai maximal ; lève en cas d'échec HTTP. */
export async function fetchJson<T>(url: string, opts: { timeoutMs?: number; init?: RequestInit } = {}): Promise<T> {
  const res = await fetch(url, { ...opts.init, signal: AbortSignal.timeout(opts.timeoutMs ?? 8000), headers: { Accept: "application/json", ...(opts.init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${new URL(url).host}`);
  return (await res.json()) as T;
}

/** Résout une promesse sans jamais lever : `null` en cas d'échec (sections dégradables). */
export async function soft<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}
