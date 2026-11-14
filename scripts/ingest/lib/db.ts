import "dotenv/config";
import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

let _sql: Sql | null = null;

/** Connexion Postgres directe (DATABASE_URL). Chargée depuis .env / .env.local si présent. */
export function db(): Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante (voir .env.example)");
  _sql = postgres(url, { max: 4, onnotice: () => {}, idle_timeout: 20 });
  return _sql;
}

export async function closeDb() {
  await _sql?.end({ timeout: 5 });
  _sql = null;
}

/** Journalise l'exécution d'un import dans ingest_runs (visible dans la page admin). */
export async function trackRun<T extends { rows?: number; sourceRef?: string }>(dataset: string, dep: string, fn: () => Promise<T>): Promise<T> {
  const sql = db();
  const [run] = await sql<{ id: number }[]>`insert into ingest_runs (dataset, dep) values (${dataset}, ${dep}) returning id`;
  const t0 = Date.now();
  try {
    const res = await fn();
    await sql`update ingest_runs set status = 'ok', rows_in = ${res.rows ?? null}, source_ref = ${res.sourceRef ?? null}, finished_at = now() where id = ${run.id}`;
    console.log(`✔ ${dataset} [${dep}] ${res.rows ?? "?"} lignes en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sql`update ingest_runs set status = 'error', error = ${msg.slice(0, 2000)}, finished_at = now() where id = ${run.id}`;
    console.error(`✘ ${dataset} [${dep}] : ${msg}`);
    throw e;
  }
}
