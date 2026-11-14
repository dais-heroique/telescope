import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { cachePath, download } from "./lib/download";
import { copyCsvToStaging } from "./lib/copy";
import { db, trackRun } from "./lib/db";
import { resolveResource } from "./lib/datagouv";

/** Flux d'un fichier à l'intérieur du zip (via `unzip -p`, présent sur macOS et Linux). */
function unzipStream(zip: string, entry: string): Readable {
  const p = spawn("unzip", ["-p", zip, entry], { stdio: ["ignore", "pipe", "inherit"] });
  return p.stdout;
}

/** Dérive l'URL de l'export département depuis l'URL de l'export France lue sur data.gouv (le millésime change). */
export function bdnbDepartmentUrl(franceUrl: string, dep: string): string {
  return franceUrl.replace(/_france\//, `_dep${dep}/`).replace(/_france_csv\.tar\.gz$/, `_dep${dep}_csv.zip`);
}

export async function ingestBdnb(dep: string) {
  return trackRun("bdnb", dep, async () => {
    const sql = db();
    const res = await resolveResource("base-de-donnees-nationale-des-batiments", (r) => /Export france - csv/i.test(r.title));
    const url = bdnbDepartmentUrl(res.url, dep);
    const zip = await download(url, cachePath(dep, `bdnb-${dep}.zip`));
    const opt = { delimiter: ";" };

    await copyCsvToStaging(sql, "stg_bdnb_bg", unzipStream(zip, "csv/batiment_groupe.csv"), { ...opt, select: ["geom_groupe", "batiment_groupe_id", "s_geom_groupe", "code_commune_insee"] });
    await copyCsvToStaging(sql, "stg_bdnb_rel", unzipStream(zip, "csv/rel_batiment_groupe_parcelle.csv"), { ...opt, select: ["batiment_groupe_id", "parcelle_id", "parcelle_principale"] });
    await copyCsvToStaging(sql, "stg_bdnb_ffo", unzipStream(zip, "csv/batiment_groupe_ffo_bat.csv"), { ...opt, select: ["batiment_groupe_id", "nb_niveau", "annee_construction", "usage_niveau_1_txt", "nb_log"] });
    await copyCsvToStaging(sql, "stg_bdnb_topo", unzipStream(zip, "csv/batiment_groupe_bdtopo_bat.csv"), { ...opt, select: ["batiment_groupe_id", "hauteur_mean", "max_hauteur"] });
    await copyCsvToStaging(sql, "stg_bdnb_rnc", unzipStream(zip, "csv/batiment_groupe_rnc.csv"), { ...opt, select: ["batiment_groupe_id", "numero_immat_principal", "nb_lot_tot"] });
    await copyCsvToStaging(sql, "stg_bdnb_usage", unzipStream(zip, "csv/batiment_groupe_synthese_propriete_usage.csv"), { ...opt, select: ["batiment_groupe_id", "usage_principal_bdnb_open"] });

    await sql`
      insert into batiments (bg_id, dep, insee, geom, surface_sol, annee_construction, nb_log, nb_niveau, usage_principal, hauteur_mean, hauteur_max, rnic_numero, rnic_nb_lots)
      select b.batiment_groupe_id, ${dep}, b.code_commune_insee,
             st_multi(st_collectionextract(st_makevalid(st_transform(st_setsrid(st_geomfromtext(b.geom_groupe), 2154), 4326)), 3)),
             nullif(b.s_geom_groupe,'')::numeric,
             round(nullif(f.annee_construction,'')::numeric)::int, round(nullif(f.nb_log,'')::numeric)::int, round(nullif(f.nb_niveau,'')::numeric)::int,
             coalesce(u.usage_principal_bdnb_open, f.usage_niveau_1_txt),
             nullif(t.hauteur_mean,'')::numeric, nullif(t.max_hauteur,'')::numeric,
             nullif(r.numero_immat_principal,''), round(nullif(r.nb_lot_tot,'')::numeric)::int
      from stg_bdnb_bg b
      left join stg_bdnb_ffo f using (batiment_groupe_id)
      left join stg_bdnb_topo t using (batiment_groupe_id)
      left join stg_bdnb_rnc r using (batiment_groupe_id)
      left join stg_bdnb_usage u using (batiment_groupe_id)
      where b.geom_groupe like 'MULTIPOLYGON%' or b.geom_groupe like 'POLYGON%'
      on conflict (bg_id) do update set
        geom = excluded.geom, surface_sol = excluded.surface_sol, annee_construction = excluded.annee_construction, nb_log = excluded.nb_log,
        nb_niveau = excluded.nb_niveau, usage_principal = excluded.usage_principal, hauteur_mean = excluded.hauteur_mean,
        hauteur_max = excluded.hauteur_max, rnic_numero = excluded.rnic_numero, rnic_nb_lots = excluded.rnic_nb_lots`;

    await sql`delete from bat_parcelle where dep = ${dep}`;
    await sql`
      insert into bat_parcelle (bg_id, idu, principale, dep)
      select batiment_groupe_id, parcelle_id, bool_or(parcelle_principale = '1'), ${dep}
      from stg_bdnb_rel where length(parcelle_id) = 14
      group by 1, 2
      on conflict do nothing`;

    const [{ n }] = await sql<{ n: string }[]>`select count(*) n from batiments where dep = ${dep}`;
    for (const t of ["bg", "rel", "ffo", "topo", "rnc", "usage"]) await sql.unsafe(`drop table if exists stg_bdnb_${t}`);
    await sql`analyze batiments`;
    return { rows: Number(n), sourceRef: url };
  });
}
