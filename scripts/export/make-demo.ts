/**
 * Extrait un petit jeu de démonstration (une emprise) de la base locale complète vers data/demo.db.
 *   npx tsx scripts/export/make-demo.ts [--bbox=minLon,minLat,maxLon,maxLat]
 * Le fichier peut ensuite être chargé dans Turso par scripts/export/sqlite-to-turso.ts (workflow « Charger la démo »).
 */
import { createClient } from "@libsql/client";
import { mkdirSync, rmSync } from "node:fs";
import { latToTileY, lonToTileX, rangeIndexSql } from "../../src/lib/geo/tile-index";
import { DATA_INDEXES, DATA_TABLES, LEVELS } from "../../src/lib/server/data-schema";

const bboxArg = process.argv.find((a) => a.startsWith("--bbox="))?.split("=")[1];
const [x0, y0, x1, y1] = (bboxArg ?? "6.115,45.890,6.145,45.912").split(",").map(Number);

async function main() {
  mkdirSync("data", { recursive: true });
  rmSync("data/demo.db", { force: true });
  const db = createClient({ url: "file:data/demo.db" });
  await db.executeMultiple(DATA_TABLES);
  await db.execute("attach database '.data/vigie.db' as src");
  const run = async (label: string, sql: string, args: (string | number)[] = []) => {
    const r = await db.execute({ sql, args });
    console.log(`${label}: ${r.rowsAffected}`);
  };
  const box = [x0, x1, y0, y1];
  await run("parcelles", "insert into parcelles select * from src.parcelles where lon between ? and ? and lat between ? and ?", box);
  await run("idx_parcelles", "insert into idx_parcelles select * from src.idx_parcelles where id in (select idu from parcelles)");
  await run("bat_parcelle", "insert into bat_parcelle select * from src.bat_parcelle where idu in (select idu from parcelles)");
  await run("batiments", "insert into batiments select * from src.batiments where bg_id in (select bg_id from bat_parcelle)");
  await run("idx_batiments", "insert into idx_batiments select * from src.idx_batiments where id in (select bg_id from batiments)");
  await run("dvf_mutations", "insert into dvf_mutations select * from src.dvf_mutations where lon between ? and ? and lat between ? and ?", box);
  await run("dvf_mutation_parcelles", "insert into dvf_mutation_parcelles select * from src.dvf_mutation_parcelles where idu in (select idu from parcelles)");
  await run("dpe", "insert into dpe select * from src.dpe where idu in (select idu from parcelles) or (lon between ? and ? and lat between ? and ?)", box);
  const idx = rangeIndexSql("src.idx_plu_zones", { x0: lonToTileX(x0, 16), x1: lonToTileX(x1, 16), y0: latToTileY(y1, 16), y1: latToTileY(y0, 16) }, [...LEVELS.plu_zones]);
  await run("plu_zones", `insert into plu_zones select * from src.plu_zones where gid in (${idx.sql})`, idx.args);
  await run("idx_plu_zones", "insert into idx_plu_zones select * from src.idx_plu_zones where id in (select gid from plu_zones)");
  await run("permis", "insert into permis select * from src.permis where lon between ? and ? and lat between ? and ?", box);
  await run("permis_parcelles", "insert into permis_parcelles select * from src.permis_parcelles where idu in (select idu from parcelles)");
  await run("rnic_copros", "insert into rnic_copros select * from src.rnic_copros where lon between ? and ? and lat between ? and ?", box);
  await run("rnic_parcelles", "insert into rnic_parcelles select * from src.rnic_parcelles where idu in (select idu from parcelles)");
  await run("pm_parcelles", "insert into pm_parcelles select * from src.pm_parcelles where idu in (select idu from parcelles)");
  await run("loyers_communes", "insert into loyers_communes select * from src.loyers_communes where insee in (select distinct insee from parcelles)");
  await run("vacance_communes", "insert into vacance_communes select * from src.vacance_communes where insee in (select distinct insee from parcelles)");
  await db.executeMultiple(DATA_INDEXES);
  await db.execute("detach database src");
  await db.execute("vacuum");
  console.log("✔ data/demo.db prêt");
}
main().catch((e) => { console.error(e); process.exit(1); });
