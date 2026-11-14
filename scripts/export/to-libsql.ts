/**
 * Exporte les données construites dans PostGIS (ingestion) vers libSQL / Turso (base lue par l'application).
 *   npm run export -- --dep=74            (cible : TURSO_DATABASE_URL, fichier local par défaut)
 *   npm run export -- --dep=74 --only=parcelles,dvf
 * Idempotent : remplace les lignes du département.
 */
import "dotenv/config";
import { createClient, type InStatement, type InValue } from "@libsql/client";
import postgres from "postgres";
import { decodeGeom, encodeGeom, geomBBox } from "../../src/lib/geo/codec";
import { indexTiles, inlineTile, latToTileY, lonToTileX } from "../../src/lib/geo/tile-index";
import { scoreParcel } from "../../src/lib/scoring";
import { DATA_INDEXES, DATA_TABLES, FEATURE_COLUMNS, LEVELS, POINT_LEVEL } from "../../src/lib/server/data-schema";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const dep = arg("dep") ?? "74";
const only = arg("only")?.split(",");
if (!/^(\d{2}|2[AB]|97\d)$/.test(dep)) throw new Error(`département invalide : ${dep}`);

const pg = postgres(process.env.INGEST_PG_URL!, { max: 2, onnotice: () => {} });
const lib = createClient({ url: process.env.TURSO_DATABASE_URL || "file:.data/vigie.db", authToken: process.env.TURSO_AUTH_TOKEN || undefined });

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const bool = (v: unknown): number | null => (v === null || v === undefined ? null : v ? 1 : 0);
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v));

async function flush(stmts: InStatement[]) {
  for (let i = 0; i < stmts.length; i += 400) {
    for (let attempt = 0; ; attempt++) {
      try {
        await lib.batch(stmts.slice(i, i + 400), "write");
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }
}

const placeholders = (n: number) => Array(n).fill("?").join(",");

/** Copie un SELECT PostgreSQL vers une table libSQL par paquets. */
async function copy(table: string, rowsQuery: ReturnType<typeof pg.unsafe>, cols: string[], map: (r: Record<string, unknown>) => { values: InValue[]; extra?: InStatement[] }) {
  const t0 = Date.now();
  let n = 0;
  let batch: InStatement[] = [];
  const sql = `insert or replace into ${table} (${cols.join(",")}) values (${placeholders(cols.length)})`;
  for await (const rows of rowsQuery.cursor(2000)) {
    for (const r of rows as Record<string, unknown>[]) {
      const { values, extra } = map(r);
      batch.push({ sql, args: values }, ...(extra ?? []));
      n++;
    }
    await flush(batch);
    batch = [];
    process.stdout.write(`  ${table} ${n}\r`);
  }
  console.log(`✔ ${table}: ${n} lignes (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

const idxStmts = (table: string, id: string, bbox: [number, number, number, number], levels: readonly number[]): InStatement[] =>
  indexTiles(bbox, [...levels]).map((t) => ({ sql: `insert or ignore into ${table} (z, tx, ty, id) values (?,?,?,?)`, args: [t.z, t.tx, t.ty, id] }));

const tile12 = (lon: number | null, lat: number | null): [number | null, number | null] =>
  lon === null || lat === null ? [null, null] : [lonToTileX(lon, POINT_LEVEL), latToTileY(lat, POINT_LEVEL)];

const steps: Record<string, () => Promise<void>> = {
  async parcelles() {
    await lib.execute({ sql: "delete from idx_parcelles where id in (select idu from parcelles where dep = ?)", args: [dep] });
    await lib.execute({ sql: "delete from parcelles where dep = ?", args: [dep] });
    const f = FEATURE_COLUMNS.map((c) => `f.${c}`).join(", ");
    const cols = ["idu", "dep", "insee", "section", "numero", "contenance", "lon", "lat", "tx", "ty", "t16x", "t16y", "geom", ...FEATURE_COLUMNS];
    const boolCols = new Set(["is_copro", "is_pm", "is_passoire", "is_divisible", "is_monopropriete", "is_dent_creuse"]);
    const dateCols = new Set(["last_sale_date", "dpe_latest_date", "last_permis_date"]);
    const jsonCols = new Set(["score_factors"]);
    await copy(
      "parcelles",
      pg.unsafe(`select p.idu, p.dep, p.insee, p.section, p.numero, p.contenance, st_x(p.pt) as lon, st_y(p.pt) as lat, st_asgeojson(p.geom, 6) as g, ${f},
                        cs.cycle_years as cs_cycle, cs.turnover_pct as cs_turn, cs.prix_m2_median as cs_px, cs.vacance_pct as cs_vac
                 from parcelles p join parcel_features f using (idu) left join commune_stats cs on cs.insee = p.insee where p.dep = '${dep}'`),
      cols,
      (r) => {
        const g = JSON.parse(r.g as string) as GeoJSON.Geometry;
        const [tx, ty] = tile12(num(r.lon), num(r.lat));
        const bb = geomBBox(g);
        const inl = inlineTile(bb);
        // Score + facteurs : seulement pour les biens « commercialisables » (bâtis, ou terrains détectés ; hors propriétaires publics)
        const publicOwner = r.pm_groupe != null && r.pm_groupe !== "personnes morales non remarquables";
        const relevant = !publicOwner && (Number(r.nb_batiments) > 0 || r.is_dent_creuse || r.is_divisible);
        const sc = relevant
          ? scoreParcel(
              { nbBatiments: Number(r.nb_batiments) || 0, holdYears: num(r.hold_years), lastSaleDate: iso(r.last_sale_date), lastSalePrixM2: num(r.last_sale_prix_m2), lastSaleType: (r.last_sale_type as string) ?? null, dpeLatest: (r.dpe_latest as string) ?? null, isPassoire: Boolean(r.is_passoire), dpeWorst: (r.dpe_worst as string) ?? null, isPm: Boolean(r.is_pm), pmGroupe: (r.pm_groupe as string) ?? null, pmForme: (r.pm_forme as string) ?? null, nbPermis5y: Number(r.nb_permis_5y) || 0, nbPermisProches: Number(r.nb_permis_proches) || 0, anneeConstruction: num(r.annee_construction), isDivisible: Boolean(r.is_divisible), isMonopropriete: Boolean(r.is_monopropriete), isDentCreuse: Boolean(r.is_dent_creuse) },
              { cycleYears: num(r.cs_cycle), turnoverPct: num(r.cs_turn), prixM2Median: num(r.cs_px), vacancePct: num(r.cs_vac) },
            )
          : null;
        const values: InValue[] = cols.map((c) => {
          if (c === "score") return sc?.score ?? null;
          if (c === "score_factors") return sc ? JSON.stringify(sc.factors) : null;
          if (c === "geom") return encodeGeom(g);
          if (c === "t16x") return inl?.x ?? null;
          if (c === "t16y") return inl?.y ?? null;
          if (c === "tx") return tx;
          if (c === "ty") return ty;
          if (boolCols.has(c)) return bool(r[c]);
          if (dateCols.has(c)) return iso(r[c]);
          if (jsonCols.has(c)) return r[c] == null ? null : JSON.stringify(r[c]);
          const v = r[c];
          return typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && !["idu", "insee", "section", "numero", "dep", "copro_numero", "pm_siren"].includes(c) ? Number(v) : ((v ?? null) as InValue);
        });
        return { values, extra: inl ? [] : idxStmts("idx_parcelles", r.idu as string, bb, LEVELS.parcelles) };
      },
    );
  },

  async batiments() {
    await lib.execute({ sql: "delete from idx_batiments where id in (select bg_id from batiments where dep = ?)", args: [dep] });
    await lib.execute({ sql: "delete from batiments where dep = ?", args: [dep] });
    await lib.execute({ sql: "delete from bat_parcelle where dep = ?", args: [dep] });
    const cols = ["bg_id", "dep", "insee", "t16x", "t16y", "geom", "surface_sol", "annee_construction", "nb_log", "nb_niveau", "usage_principal", "hauteur_mean", "hauteur_max", "rnic_numero", "rnic_nb_lots"];
    await copy("batiments", pg.unsafe(`select bg_id, dep, insee, st_asgeojson(geom, 6) as g, surface_sol, annee_construction, nb_log, nb_niveau, usage_principal, hauteur_mean, hauteur_max, rnic_numero, rnic_nb_lots from batiments where dep = '${dep}'`), cols, (r) => {
      const g = JSON.parse(r.g as string) as GeoJSON.Geometry;
      const bb = geomBBox(g);
      const inl = inlineTile(bb);
      return {
        values: [r.bg_id, r.dep, r.insee, inl?.x ?? null, inl?.y ?? null, encodeGeom(g), num(r.surface_sol), num(r.annee_construction), num(r.nb_log), num(r.nb_niveau), r.usage_principal, num(r.hauteur_mean), num(r.hauteur_max), r.rnic_numero, num(r.rnic_nb_lots)] as InValue[],
        extra: inl ? [] : idxStmts("idx_batiments", r.bg_id as string, bb, LEVELS.batiments),
      };
    });
    await copy("bat_parcelle", pg.unsafe(`select bg_id, idu, principale, dep from bat_parcelle where dep = '${dep}'`), ["bg_id", "idu", "principale", "dep"], (r) => ({ values: [r.bg_id, r.idu, bool(r.principale), r.dep] as InValue[] }));
  },

  async dvf() {
    await lib.execute({ sql: "delete from dvf_mutations where dep = ?", args: [dep] });
    await lib.execute({ sql: "delete from dvf_mutation_parcelles where dep = ?", args: [dep] });
    const cols = ["id_mutation", "dep", "insee", "date_mutation", "nature", "valeur_fonciere", "adresse", "surface_bati_res", "surface_bati_tot", "surface_terrain", "nb_lots", "nb_parcelles", "type_principal", "nb_pieces", "prix_m2", "lon", "lat", "tx", "ty"];
    await copy("dvf_mutations", pg.unsafe(`select id_mutation, dep, insee, date_mutation, nature, valeur_fonciere, adresse, surface_bati_res, surface_bati_tot, surface_terrain, nb_lots, nb_parcelles, type_principal, nb_pieces, prix_m2, st_x(geom) as lon, st_y(geom) as lat from dvf_mutations where dep = '${dep}'`), cols, (r) => {
      const lon = num(r.lon), lat = num(r.lat);
      const [tx, ty] = tile12(lon, lat);
      return { values: [r.id_mutation, r.dep, r.insee, iso(r.date_mutation), r.nature, num(r.valeur_fonciere), r.adresse, num(r.surface_bati_res), num(r.surface_bati_tot), num(r.surface_terrain), num(r.nb_lots), num(r.nb_parcelles), r.type_principal, num(r.nb_pieces), num(r.prix_m2), lon, lat, tx, ty] as InValue[] };
    });
    await copy("dvf_mutation_parcelles", pg.unsafe(`select id_mutation, idu, dep from dvf_mutation_parcelles where dep = '${dep}'`), ["id_mutation", "idu", "dep"], (r) => ({ values: [r.id_mutation, r.idu, r.dep] as InValue[] }));
  },

  async dpe() {
    await lib.execute({ sql: "delete from dpe where dep = ?", args: [dep] });
    const cols = ["numero_dpe", "kind", "dep", "insee", "date_dpe", "etiquette_dpe", "etiquette_ges", "type_batiment", "annee_construction", "periode_construction", "surface", "conso_m2_ep", "adresse", "id_ban", "lon", "lat", "idu"];
    await copy("dpe", pg.unsafe(`select numero_dpe, kind, dep, insee, date_dpe, etiquette_dpe, etiquette_ges, type_batiment, annee_construction, periode_construction, surface, conso_m2_ep, adresse, id_ban, st_x(geom) as lon, st_y(geom) as lat, idu from dpe where dep = '${dep}'`), cols, (r) => ({
      values: [r.numero_dpe, r.kind, r.dep, r.insee, iso(r.date_dpe), r.etiquette_dpe, r.etiquette_ges, r.type_batiment, num(r.annee_construction), r.periode_construction, num(r.surface), num(r.conso_m2_ep), r.adresse, r.id_ban, num(r.lon), num(r.lat), r.idu] as InValue[],
    }));
  },

  async plu() {
    await lib.execute({ sql: "delete from idx_plu_zones where id in (select gid from plu_zones where dep = ?)", args: [dep] });
    await lib.execute({ sql: "delete from plu_zones where dep = ?", args: [dep] });
    const cols = ["gid", "dep", "partition", "typezone", "libelle", "libelong", "urlfic", "datappro", "geom"];
    await copy("plu_zones", pg.unsafe(`select gid, dep, partition, typezone, libelle, libelong, urlfic, datappro, st_asgeojson(st_simplifypreservetopology(geom, 0.00002), 5) as g from plu_zones where dep = '${dep}'`), cols, (r) => {
      const g = JSON.parse(r.g as string) as GeoJSON.Geometry;
      return { values: [r.gid, r.dep, r.partition, r.typezone, r.libelle, r.libelong, r.urlfic, iso(r.datappro), encodeGeom(g)] as InValue[], extra: idxStmts("idx_plu_zones", r.gid as string, geomBBox(g), LEVELS.plu_zones) };
    });
  },

  async permis() {
    await lib.execute({ sql: "delete from permis where dep = ?", args: [dep] });
    await lib.execute({ sql: "delete from permis_parcelles where dep = ?", args: [dep] });
    const cols = ["num_dau", "dep", "insee", "type_dau", "etat_dau", "date_autorisation", "adresse", "siren_dem", "denom_dem", "nb_logements", "surf_habitable", "kind", "lon", "lat", "tx", "ty"];
    await copy("permis", pg.unsafe(`select pe.num_dau, pe.dep, pe.insee, pe.type_dau, pe.etat_dau, pe.date_autorisation, pe.adresse, pe.siren_dem, pe.denom_dem, pe.nb_logements, pe.surf_habitable, pe.kind, st_x(x.pt) as lon, st_y(x.pt) as lat
      from permis pe left join lateral (select p.pt from permis_parcelles pp join parcelles p on p.idu = pp.idu where pp.num_dau = pe.num_dau limit 1) x on true where pe.dep = '${dep}'`), cols, (r) => {
      const lon = num(r.lon), lat = num(r.lat);
      const [tx, ty] = tile12(lon, lat);
      return { values: [r.num_dau, r.dep, r.insee, r.type_dau, num(r.etat_dau), iso(r.date_autorisation), r.adresse, r.siren_dem, r.denom_dem, num(r.nb_logements), num(r.surf_habitable), r.kind, lon, lat, tx, ty] as InValue[] };
    });
    await copy("permis_parcelles", pg.unsafe(`select num_dau, idu, dep from permis_parcelles where dep = '${dep}'`), ["num_dau", "idu", "dep"], (r) => ({ values: [r.num_dau, r.idu, r.dep] as InValue[] }));
  },

  async rnic() {
    await lib.execute({ sql: "delete from rnic_copros where dep = ?", args: [dep] });
    await lib.execute({ sql: "delete from rnic_parcelles where dep = ?", args: [dep] });
    const cols = ["numero", "dep", "insee", "nom", "adresse", "nb_lots", "nb_lots_hab", "periode_construction", "syndic_type", "lon", "lat", "tx", "ty"];
    await copy("rnic_copros", pg.unsafe(`select numero, dep, insee, nom, adresse, nb_lots, nb_lots_hab, periode_construction, syndic_type, st_x(geom) as lon, st_y(geom) as lat from rnic_copros where dep = '${dep}'`), cols, (r) => {
      const lon = num(r.lon), lat = num(r.lat);
      const [tx, ty] = tile12(lon, lat);
      return { values: [r.numero, r.dep, r.insee, r.nom, r.adresse, num(r.nb_lots), num(r.nb_lots_hab), r.periode_construction, r.syndic_type, lon, lat, tx, ty] as InValue[] };
    });
    await copy("rnic_parcelles", pg.unsafe(`select numero, idu, dep from rnic_parcelles where dep = '${dep}'`), ["numero", "idu", "dep"], (r) => ({ values: [r.numero, r.idu, r.dep] as InValue[] }));
  },

  async pm() {
    await lib.execute({ sql: "delete from pm_parcelles where dep = ?", args: [dep] });
    await copy("pm_parcelles", pg.unsafe(`select idu, siren, dep, denomination, forme_juridique, groupe_personne, millesime from pm_parcelles where dep = '${dep}'`), ["idu", "siren", "dep", "denomination", "forme_juridique", "groupe_personne", "millesime"], (r) => ({ values: [r.idu, r.siren, r.dep, r.denomination, r.forme_juridique, r.groupe_personne, num(r.millesime)] as InValue[] }));
  },

  async communal() {
    await lib.execute({ sql: "delete from loyers_communes where insee like ?", args: [`${dep}%`] });
    await copy("loyers_communes", pg.unsafe(`select insee, type_bien, loyer_m2, loyer_m2_min, loyer_m2_max, fiabilite, annee from loyers_communes where insee like '${dep}%'`), ["insee", "type_bien", "loyer_m2", "loyer_m2_min", "loyer_m2_max", "fiabilite", "annee"], (r) => ({ values: [r.insee, r.type_bien, num(r.loyer_m2), num(r.loyer_m2_min), num(r.loyer_m2_max), r.fiabilite, num(r.annee)] as InValue[] }));
    await copy("vacance_communes", pg.unsafe(`select insee, annee, logements_total, logements_vacants, taux_vacance from vacance_communes where insee like '${dep}%'`), ["insee", "annee", "logements_total", "logements_vacants", "taux_vacance"], (r) => ({ values: [r.insee, num(r.annee), num(r.logements_total), num(r.logements_vacants), num(r.taux_vacance)] as InValue[] }));
  },
};

async function main() {
  console.log(`▶ Export du département ${dep} vers ${process.env.TURSO_DATABASE_URL || "file:.data/vigie.db"}`);
  await lib.executeMultiple(DATA_TABLES);
  for (const [name, fn] of Object.entries(steps)) if (!only || only.includes(name)) await fn();
  console.log("▶ Index secondaires…");
  await lib.executeMultiple(DATA_INDEXES);
  await lib.execute("analyze");
  await pg.end();
  console.log("✔ export terminé");
  void decodeGeom;
}
main().catch((e) => { console.error(e); process.exit(1); });
