/**
 * Copie un fichier SQLite de données (ex. data/demo.db) vers libSQL/Turso (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN).
 *   npx tsx scripts/export/sqlite-to-turso.ts data/demo.db
 * « insert or replace » : relançable, ne supprime rien.
 */
import "dotenv/config";
import { createClient, type InValue } from "@libsql/client";
import { normalizeLibsqlUrl } from "../../src/lib/libsql-url";
import { DATA_INDEXES, DATA_TABLES } from "../../src/lib/server/data-schema";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage : sqlite-to-turso.ts <fichier.db>");
  const src = createClient({ url: `file:${file}` });
  const dst = createClient({ url: normalizeLibsqlUrl(process.env.TURSO_DATABASE_URL), authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  await dst.executeMultiple(DATA_TABLES);
  const tables = (await src.execute("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")).rows.map((r) => String(r[0]));
  for (const t of tables) {
    const cols = (await src.execute(`pragma table_info(${t})`)).rows.map((r) => String(r[1]));
    const sql = `insert or replace into ${t} (${cols.join(",")}) values (${cols.map(() => "?").join(",")})`;
    let offset = 0;
    let total = 0;
    for (;;) {
      const page = await src.execute({ sql: `select ${cols.join(",")} from ${t} limit 2000 offset ?`, args: [offset] });
      if (!page.rows.length) break;
      const stmts = page.rows.map((r) => ({ sql, args: cols.map((_, i) => r[i] as InValue) }));
      for (let i = 0; i < stmts.length; i += 400) {
        for (let attempt = 0; ; attempt++) {
          try {
            await dst.batch(stmts.slice(i, i + 400), "write");
            break;
          } catch (e) {
            if (attempt >= 4) throw e;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      }
      total += page.rows.length;
      offset += 2000;
    }
    console.log(`✔ ${t}: ${total} lignes`);
  }
  await dst.executeMultiple(DATA_INDEXES);
  console.log("✔ chargement terminé");
}
main().catch((e) => { console.error(e); process.exit(1); });
