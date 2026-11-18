/**
 * Découpe la base d'un département (fichier libSQL produit par to-libsql.ts) en « morceaux » SQLite
 * autonomes, chacun couvrant un groupe de communes voisines, compressés en brotli.
 *   npx tsx scripts/export/make-shards.ts --dep=74 --db=.data/vigie.db --out=out/shards [--target-mb=40]
 * Sortie : <out>/<dep>-<n>.db.br + <out>/manifest-<dep>.json (communes, emprises, tailles).
 * L'application ne télécharge que les morceaux de la zone regardée (lecture seule, hébergement gratuit).
 */
import { createClient, type Client } from "@libsql/client";
import { createReadStream, createWriteStream, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { constants, createBrotliCompress } from "node:zlib";
import { decodeGeom, geomBBox } from "../../src/lib/geo/codec";
import { DATA_INDEXES, DATA_TABLES } from "../../src/lib/server/data-schema";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const DEP = arg("dep") ?? "74";
const SRC = arg("db") ?? ".data/vigie.db";
const OUT = arg("out") ?? "out/shards";
const TARGET = Number(arg("target-mb") ?? 40) * 1e6;
const WORK = arg("work") ?? `${OUT}/.work`;

/** Parcelles utiles : bâties, notées, détectées, avec ventes/DPE, personnes morales ou copropriétés. Les autres sont affichées via les tuiles IGN. */
const KEEP = "(coalesce(nb_batiments,0) > 0 or score is not null or is_dent_creuse = 1 or is_divisible = 1 or is_monopropriete = 1 or coalesce(nb_ventes,0) > 0 or coalesce(nb_dpe,0) > 0 or is_pm = 1 or is_copro = 1)";

// Octets approximatifs par ligne (tables + index) pour équilibrer la taille des morceaux.
const BYTES = { parcelle: 420, batiment: 190, bat_parcelle: 70, dvf: 190, dpe: 330, pm: 230, permis: 130, zone: 400 };

interface Commune { insee: string; bbox: [number, number, number, number]; n: number; w: number; }

/** Position sur une courbe de Hilbert (16 bits) : communes voisines → rangs voisins. */
function hilbert(x: number, y: number): number {
  let d = 0;
  for (let s = 1 << 15; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      [x, y] = [y, x];
    }
  }
  return d;
}

async function rows(db: Client, sql: string): Promise<Record<string, unknown>[]> {
  const r = await db.execute(sql);
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]])));
}

export function packCommunes(communes: Commune[], target: number): Commune[][] {
  const sorted = [...communes].sort((a, b) => {
    const ca = [(a.bbox[0] + a.bbox[2]) / 2, (a.bbox[1] + a.bbox[3]) / 2];
    const cb = [(b.bbox[0] + b.bbox[2]) / 2, (b.bbox[1] + b.bbox[3]) / 2];
    const h = (c: number[]) => hilbert(Math.floor(((c[0]! + 180) / 360) * 65535), Math.floor(((c[1]! + 90) / 180) * 65535));
    return h(ca) - h(cb);
  });
  const groups: Commune[][] = [];
  let cur: Commune[] = [];
  let w = 0;
  for (const c of sorted) {
    if (cur.length && w + c.w > target * 1.25) { groups.push(cur); cur = []; w = 0; }
    cur.push(c);
    w += c.w;
    if (w >= target) { groups.push(cur); cur = []; w = 0; }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

async function compress(file: string): Promise<number> {
  const out = `${file}.br`;
  await pipeline(createReadStream(file), createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_LGWIN]: 24, [constants.BROTLI_PARAM_SIZE_HINT]: statSync(file).size } }), createWriteStream(out));
  rmSync(file);
  return statSync(out).size;
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const src = createClient({ url: `file:${SRC}` });

  // 1. Communes et poids estimés
  const base = await rows(src, `select insee, count(*) n, min(lon) x0, min(lat) y0, max(lon) x1, max(lat) y1 from parcelles where dep = '${DEP}' and ${KEEP} group by insee`);
  const by = async (sql: string) => new Map((await rows(src, sql)).map((r) => [String(r.insee), Number(r.n)]));
  const nBat = await by(`select insee, count(*) n from batiments where dep = '${DEP}' group by insee`);
  const nDvf = await by(`select insee, count(*) n from dvf_mutations where dep = '${DEP}' group by insee`);
  const nDpe = await by(`select insee, count(*) n from dpe where dep = '${DEP}' group by insee`);
  const nPermis = await by(`select insee, count(*) n from permis where dep = '${DEP}' group by insee`);
  const nPm = await by(`select substr(idu,1,5) as insee, count(*) n from pm_parcelles where dep = '${DEP}' group by 1`);
  const communes: Commune[] = base.map((r) => {
    const insee = String(r.insee);
    const n = Number(r.n);
    const w = n * BYTES.parcelle + (nBat.get(insee) ?? 0) * (BYTES.batiment + BYTES.bat_parcelle) + (nDvf.get(insee) ?? 0) * BYTES.dvf + (nDpe.get(insee) ?? 0) * BYTES.dpe + (nPm.get(insee) ?? 0) * BYTES.pm + (nPermis.get(insee) ?? 0) * BYTES.permis;
    return { insee, n, w, bbox: [Number(r.x0), Number(r.y0), Number(r.x1), Number(r.y1)] };
  });
  if (!communes.length) throw new Error(`aucune parcelle pour le département ${DEP} dans ${SRC}`);
  const groups = packCommunes(communes, TARGET);
  console.log(`▶ ${communes.length} communes → ${groups.length} morceaux (cible ${TARGET / 1e6} Mo)`);

  // 2. Zones PLU : emprise de chaque zone (une zone peut chevaucher plusieurs morceaux)
  const zones = (await rows(src, "select gid, geom from plu_zones")).map((z) => {
    const b = geomBBox(decodeGeom(z.geom as ArrayBuffer));
    return { gid: String(z.gid), b };
  });

  const manifest = { v: 1, dep: DEP, builtAt: new Date().toISOString(), shards: [] as Record<string, unknown>[] };
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const name = `${DEP}-${i}`;
    const file = `${WORK}/${name}.db`;
    rmSync(file, { force: true });
    const db = createClient({ url: `file:${file}` });
    await db.executeMultiple(DATA_TABLES);
    await db.execute(`attach database '${SRC.replace(/'/g, "''")}' as src`);
    await db.execute("create temp table sc (insee text primary key)");
    for (let k = 0; k < g.length; k += 500) {
      await db.execute({ sql: `insert into sc values ${g.slice(k, k + 500).map(() => "(?)").join(",")}`, args: g.slice(k, k + 500).map((c) => c.insee) });
    }
    const bb: [number, number, number, number] = [Math.min(...g.map((c) => c.bbox[0])) - 0.003, Math.min(...g.map((c) => c.bbox[1])) - 0.003, Math.max(...g.map((c) => c.bbox[2])) + 0.003, Math.max(...g.map((c) => c.bbox[3])) + 0.003];
    await db.execute("create temp table sz (gid text primary key)");
    const inZ = zones.filter((z) => z.b[0] <= bb[2] && z.b[2] >= bb[0] && z.b[1] <= bb[3] && z.b[3] >= bb[1]).map((z) => z.gid);
    for (let k = 0; k < inZ.length; k += 500) {
      await db.execute({ sql: `insert into sz values ${inZ.slice(k, k + 500).map(() => "(?)").join(",")}`, args: inZ.slice(k, k + 500) });
    }
    const ex = async (sql: string) => { await db.execute(sql); };
    await ex(`insert into parcelles select * from src.parcelles where insee in (select insee from sc) and ${KEEP}`);
    await ex("insert into idx_parcelles select * from src.idx_parcelles where id in (select idu from parcelles)");
    await ex("insert into bat_parcelle select * from src.bat_parcelle where idu in (select idu from parcelles)");
    // Un bâtiment n'est stocké que dans le morceau de sa plus petite parcelle (pas de doublon quand plusieurs morceaux sont lus ensemble)
    await ex("create temp table sb as select bg_id from src.bat_parcelle group by bg_id having min(idu) in (select idu from parcelles)");
    await ex("insert into batiments select * from src.batiments where bg_id in (select bg_id from sb)");
    await ex("insert into idx_batiments select * from src.idx_batiments where id in (select bg_id from sb)");
    await ex("insert into dvf_mutations select * from src.dvf_mutations where insee in (select insee from sc)");
    await ex("insert into dvf_mutation_parcelles select * from src.dvf_mutation_parcelles where id_mutation in (select id_mutation from dvf_mutations)");
    await ex("insert into dpe select * from src.dpe where insee in (select insee from sc)");
    await ex("insert into plu_zones select * from src.plu_zones where gid in (select gid from sz)");
    await ex("insert into idx_plu_zones select * from src.idx_plu_zones where id in (select gid from sz)");
    await ex("insert into permis select * from src.permis where insee in (select insee from sc)");
    await ex("insert into permis_parcelles select * from src.permis_parcelles where num_dau in (select num_dau from permis)");
    await ex("insert into rnic_copros select * from src.rnic_copros where insee in (select insee from sc)");
    await ex("insert into rnic_parcelles select * from src.rnic_parcelles where numero in (select numero from rnic_copros)");
    await ex("insert into pm_parcelles select * from src.pm_parcelles where idu in (select idu from parcelles)");
    await ex("insert into loyers_communes select * from src.loyers_communes where insee in (select insee from sc)");
    await ex("insert into vacance_communes select * from src.vacance_communes where insee in (select insee from sc)");
    await db.executeMultiple(DATA_INDEXES);
    await db.execute("detach database src");
    await db.execute("analyze");
    await db.execute("vacuum");
    db.close();
    const raw = statSync(file).size;
    const size = await compress(file);
    mkdirSync(OUT, { recursive: true });
    renameSync(`${file}.br`, `${OUT}/${name}.db.br`);
    manifest.shards.push({ id: i, file: `${name}.db.br`, raw, size, bbox: bb, communes: g.map((c) => ({ insee: c.insee, bbox: c.bbox, n: c.n })) });
    console.log(`  ${name}: ${g.length} communes, ${(raw / 1e6).toFixed(0)} Mo → ${(size / 1e6).toFixed(1)} Mo`);
  }
  writeFileSync(`${OUT}/manifest-${DEP}.json`, JSON.stringify(manifest));
  rmSync(WORK, { recursive: true, force: true });
  src.close();
  const total = manifest.shards.reduce((s, x) => s + Number(x.size), 0);
  console.log(`✔ ${manifest.shards.length} morceaux, ${(total / 1e6).toFixed(0)} Mo compressés → ${OUT}`);
}

if (process.argv[1]?.endsWith("make-shards.ts")) main().catch((e) => { console.error(e); process.exit(1); });
