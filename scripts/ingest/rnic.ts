import { createReadStream } from "node:fs";
import { cachePath, download } from "./lib/download";
import { copyCsvToStaging } from "./lib/copy";
import { db, trackRun } from "./lib/db";
import { resolveResource } from "./lib/datagouv";

/**
 * RNIC (ANAH) : fichier national quotidien (~410 Mo) filtré sur le département.
 * Le fichier est conservé en cache : relancer ne le retélécharge pas (supprimer .data/national/rnic.csv pour forcer).
 */
export async function ingestRnic(dep: string) {
  return trackRun("rnic", dep, async () => {
    const sql = db();
    const r = await resolveResource("registre-national-dimmatriculation-des-coproprietes", (x) => /Actualisation quotidienne/i.test(x.title));
    const file = await download(r.url, cachePath("national", `rnic-${r.url.split("/")[r.url.split("/").length - 2]}.csv`));
    const depOf = (insee: string) => (insee.startsWith("97") ? insee.slice(0, 3) : insee.slice(0, 2));
    const cols = [
      "numero_immatriculation", "nom_usage_copropriete", "adresse_reference", "commune", "code_officiel_commune", "longitude", "latitude",
      "nombre_total_lots", "nombre_lots_habitation", "periode_construction", "type_syndic",
      ...[1, 2, 3].flatMap((i) => [`code_insee_parcelle_${i}`, `prefixe_parcelle_${i}`, `section_parcelle_${i}`, `numero_parcelle_${i}`]),
    ];
    const n = await copyCsvToStaging(sql, "stg_rnic", createReadStream(file), {
      select: cols,
      filter: (row) => depOf(row.code_officiel_commune || row.commune || "") === dep,
    });
    await sql`delete from rnic_parcelles where dep = ${dep}`;
    await sql`delete from rnic_copros where dep = ${dep}`;
    await sql`
      insert into rnic_copros (numero, dep, insee, nom, adresse, nb_lots, nb_lots_hab, periode_construction, syndic_type, geom)
      select numero_immatriculation, ${dep}, coalesce(nullif(code_officiel_commune,''), commune), nullif(nom_usage_copropriete,''), nullif(adresse_reference,''),
             nullif(nombre_total_lots,'')::int, nullif(nombre_lots_habitation,'')::int, nullif(periode_construction,''), nullif(type_syndic,''),
             case when longitude <> '' and latitude <> '' then st_setsrid(st_makepoint(longitude::float8, latitude::float8), 4326) end
      from (select distinct on (numero_immatriculation) * from stg_rnic where numero_immatriculation <> '' order by numero_immatriculation) s
      on conflict (numero) do update set nb_lots = excluded.nb_lots, nb_lots_hab = excluded.nb_lots_hab, geom = excluded.geom, nom = excluded.nom`;
    for (const i of [1, 2, 3]) {
      await sql.unsafe(
        `insert into rnic_parcelles (numero, idu, dep)
         select numero_immatriculation,
                code_insee_parcelle_${i} || lpad(coalesce(nullif(prefixe_parcelle_${i},''),'000'), 3, '0') || lpad(section_parcelle_${i}, 2, '0') || lpad(numero_parcelle_${i}, 4, '0'), $1
         from stg_rnic
         where coalesce(code_insee_parcelle_${i},'') <> '' and coalesce(section_parcelle_${i},'') <> '' and coalesce(numero_parcelle_${i},'') <> ''
         on conflict do nothing`,
        [dep],
      );
    }
    await sql`drop table if exists stg_rnic`;
    return { rows: n, sourceRef: r.url };
  });
}
