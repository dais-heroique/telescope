import postgres from "postgres";

declare global {
  var __vigieSql: ReturnType<typeof postgres> | undefined;
}

/** Connexion Postgres directe pour les tuiles MVT et les requêtes spatiales. `null` si DATABASE_URL absente (mode démo). */
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  // `prepare: false` : compatible pooler Supabase (pgbouncer en mode transaction).
  globalThis.__vigieSql ??= postgres(url, { max: 8, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
  return globalThis.__vigieSql;
}
