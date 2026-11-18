const mem = new Map<string, { exp: number; v: unknown }>();

/**
 * Cache des APIs publiques (mode « à la demande ») : mémoire du processus uniquement (aucune écriture en base).
 * TTL en secondes. Les échecs de chargement ne sont jamais mis en cache.
 */
export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const m = mem.get(key);
  if (m && m.exp > Date.now()) return m.v as T;
  const v = await load();
  mem.set(key, { exp: Date.now() + ttlSec * 1000, v });
  // Mémoire plafonnée (instances serverless de courte durée)
  if (mem.size > 500) for (const k of [...mem.keys()].slice(0, 100)) mem.delete(k);
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
