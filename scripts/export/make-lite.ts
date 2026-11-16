/**
 * Construit la base « allégée » embarquée dans le déploiement (lecture seule, zéro écriture Turso) :
 * les communes les plus actives de la base locale complète, compressées en morceaux gzip (data/lite/).
 *   npx tsx scripts/export/make-lite.ts [--share=0.3] [--communes=74010,74281]
 * --share : part approximative (poids parcelles + bâties) de la base complète à conserver.
 * Les communes non embarquées restent consultables en « mode à la demande » (fiche via les API publiques).
 */
import { createClient } from "@libsql/client";
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { DATA_INDEXES, DATA_TABLES } from "../../src/lib/server/data-schema";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const SHARE = Number(arg("share") ?? 0.3);
const FORCE = (arg("communes") ?? "74010").split(",").filter(Boolean);
const OUT = ".data/vigie-lite.db";
const PART_MB = 40;

async function main() {
  rmSync(OUT, { force: true });
  const db = createClient({ url: `file:${OUT}` });
  await db.executeMultiple(DATA_TABLES);
  await db.execute("attach database '.data/vigie.db' as src");

  // Communes classées par poids (parcelles + 2 × parcelles bâties), cumul jusqu'à SHARE du total.
  const rank = await db.execute("select insee, count(*) n, sum(coalesce(nb_batiments,0) > 0) b from src.parcelles group by insee");
  const rows = rank.rows.map((r) => ({ insee: String(r[0]), w: Number(r[1]) + 2 * Number(r[2]) })).sort((a, b) => b.w - a.w);
  const total = rows.reduce((s, r) => s + r.w, 0);
  const keep = new Set(FORCE);
  let acc = rows.filter((r) => keep.has(r.insee)).reduce((s, r) => s + r.w, 0);
  for (const r of rows) {
    if (acc >= total * SHARE) break;
    if (!keep.has(r.insee)) { keep.add(r.insee); acc += r.w; }
  }
  console.log(`${keep.size}/${rows.length} communes, ${(100 * acc / total).toFixed(1)} % du poids`);
  await db.execute("create temp table keep_insee (insee text primary key)");
  for (const i of keep) await db.execute({ sql: "insert into keep_insee values (?)", args: [i] });

  const run = async (label: string, sql: string) => {
    const r = await db.execute(sql);
    console.log(`${label}: ${r.rowsAffected}`);
  };
  await run("parcelles", "insert into parcelles select * from src.parcelles where insee in (select insee from keep_insee)");
  await run("idx_parcelles", "insert into idx_parcelles select * from src.idx_parcelles where id in (select idu from parcelles)");
  await run("bat_parcelle", "insert into bat_parcelle select * from src.bat_parcelle where idu in (select idu from parcelles)");
  await run("batiments", "insert into batiments select * from src.batiments where bg_id in (select bg_id from bat_parcelle)");
  await run("idx_batiments", "insert into idx_batiments select * from src.idx_batiments where id in (select bg_id from batiments)");
  await run("dvf_mutations", "insert into dvf_mutations select * from src.dvf_mutations where insee in (select insee from keep_insee)");
  await run("dvf_mutation_parcelles", "insert into dvf_mutation_parcelles select * from src.dvf_mutation_parcelles where id_mutation in (select id_mutation from dvf_mutations)");
  await run("dpe", "insert into dpe select * from src.dpe where insee in (select insee from keep_insee)");
  await run("plu_zones", "insert into plu_zones select * from src.plu_zones");
  await run("idx_plu_zones", "insert into idx_plu_zones select * from src.idx_plu_zones");
  await run("permis", "insert into permis select * from src.permis where insee in (select insee from keep_insee)");
  await run("permis_parcelles", "insert into permis_parcelles select * from src.permis_parcelles where idu in (select idu from parcelles)");
  await run("rnic_copros", "insert into rnic_copros select * from src.rnic_copros where insee in (select insee from keep_insee)");
  await run("rnic_parcelles", "insert into rnic_parcelles select * from src.rnic_parcelles where idu in (select idu from parcelles)");
  await run("pm_parcelles", "insert into pm_parcelles select * from src.pm_parcelles where idu in (select idu from parcelles)");
  await run("loyers_communes", "insert into loyers_communes select * from src.loyers_communes");
  await run("vacance_communes", "insert into vacance_communes select * from src.vacance_communes");
  await db.executeMultiple(DATA_INDEXES);
  await db.execute("detach database src");
  await db.execute("analyze");
  await db.execute("vacuum");
  db.close();
  const bytes = statSync(OUT).size;
  console.log(`base allégée : ${(bytes / 1e6).toFixed(0)} Mo`);

  // Compression + découpage (GitHub limite les fichiers à 100 Mo).
  const dir = "data/lite";
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execSync(`gzip -9 -c ${OUT} | split -b ${PART_MB}m -d -a 2 - ${dir}/vigie-lite.db.gz.part`, { stdio: "inherit", shell: "/bin/bash" });
  const parts = readdirSync(dir).filter((f) => f.startsWith("vigie-lite.db.gz.part")).sort();
  const gz = parts.reduce((s, f) => s + statSync(`${dir}/${f}`).size, 0);
  writeFileSync(`${dir}/manifest.json`, JSON.stringify({ bytes, parts, communes: [...keep].sort(), builtAt: new Date().toISOString() }, null, 1));
  console.log(`✔ ${parts.length} morceaux, ${(gz / 1e6).toFixed(0)} Mo compressés`);
}
main().catch((e) => { console.error(e); process.exit(1); });
