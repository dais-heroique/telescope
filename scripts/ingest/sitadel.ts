import { Readable } from "node:stream";
import { copyCsvToStaging } from "./lib/copy";
import { db, trackRun } from "./lib/db";

const DIDO = "https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles";

export const SITADEL_FILES = [
  { kind: "logement", rid: "8b35affb-55fc-4c1f-915b-7750f974446a" },
  { kind: "local", rid: "f8f0700f-806c-40a7-83b1-f21cf507e7c4" },
  { kind: "demolir", rid: "1a9a2f0c-56fe-4e69-84a7-fbbda2121f02" },
  { kind: "amenager", rid: "96883f50-538b-41f9-a059-c6eb97e6a23a" },
] as const;

const WANTED = [
  "NUM_DAU", "TYPE_DAU", "ETAT_DAU", "NUM_PD", "ETAT_PD", "NUM_PA", "ETAT_PA", "DATE_REELLE_AUTORISATION", "COMM", "ADR_NUM_TER", "ADR_LIBVOIE_TER", "SIREN_DEM", "DENOM_DEM",
  "NB_LGT_TOT_CREES", "SURF_HAB_CREEE",
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => [`SEC_CADASTRE${i}`, `NUM_CADASTRE${i}`]),
];

/** L'API DiDo refuse les colonnes inconnues en listant celles autorisées : on s'en sert pour croiser avec WANTED. */
export async function allowedColumns(rid: string): Promise<string[]> {
  const res = await fetch(`${DIDO}/${rid}/csv?columns=__probe__`);
  const body = (await res.json()) as { errors?: string[] };
  const msg = body.errors?.[0] ?? "";
  const list = msg.split("autorisées")[1] ?? "";
  return list.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function ingestSitadel(dep: string) {
  return trackRun("sitadel", dep, async () => {
    const sql = db();
    await sql`delete from permis_parcelles where dep = ${dep}`;
    let total = 0;
    for (const f of SITADEL_FILES) {
      const allowed = new Set(await allowedColumns(f.rid));
      const cols = WANTED.filter((c) => allowed.has(c));
      const res = await fetch(`${DIDO}/${f.rid}/csv?${new URLSearchParams({ DEP_CODE: `eq:${dep}`, columns: cols.join(",") })}`);
      if (!res.ok || !res.body) throw new Error(`Sitadel ${f.kind} : HTTP ${res.status}`);
      const hasLgt = cols.includes("NB_LGT_TOT_CREES");
      // Les fichiers « permis de démolir » et « permis d'aménager » nomment l'identifiant NUM_PD / NUM_PA (pas de TYPE_DAU).
      const id = `"${cols.find((c) => ["NUM_DAU", "NUM_PD", "NUM_PA"].includes(c))}"`;
      const etat = `"${cols.find((c) => ["ETAT_DAU", "ETAT_PD", "ETAT_PA"].includes(c))}"`;
      const type = cols.includes("TYPE_DAU") ? `"TYPE_DAU"` : f.kind === "demolir" ? `'PD'` : `'PA'`;
      await copyCsvToStaging(sql, "stg_sitadel", Readable.fromWeb(res.body as never), { delimiter: ";", select: cols });
      const refs = [1, 2, 3, 4, 5, 6].filter((i) => cols.includes(`SEC_CADASTRE${i}`));

      await sql.unsafe(
        `insert into permis (num_dau, dep, insee, type_dau, etat_dau, date_autorisation, adresse, siren_dem, denom_dem, nb_logements, surf_habitable, kind)
         select distinct on (${id}) ${id}, $1, "COMM", ${type}, nullif(${etat},'')::int, nullif("DATE_REELLE_AUTORISATION",'')::date,
                nullif(trim(coalesce("ADR_NUM_TER",'') || ' ' || coalesce("ADR_LIBVOIE_TER",'')),''), nullif("SIREN_DEM",''), nullif("DENOM_DEM",''),
                ${hasLgt ? `nullif("NB_LGT_TOT_CREES",'')::int, nullif("SURF_HAB_CREEE",'')::numeric` : "null, null"}, $2
         from stg_sitadel where ${id} is not null order by ${id}
         on conflict (num_dau) do update set etat_dau = excluded.etat_dau, date_autorisation = excluded.date_autorisation,
           nb_logements = excluded.nb_logements, surf_habitable = excluded.surf_habitable`,
        [dep, f.kind],
      );
      // IDU = INSEE + préfixe(000, non fourni par Sitadel) + section(2) + numéro(4)
      for (const i of refs) {
        await sql.unsafe(
          `insert into permis_parcelles (num_dau, idu, dep)
           select ${id}, "COMM" || '000' || lpad("SEC_CADASTRE${i}", 2, '0') || lpad("NUM_CADASTRE${i}", 4, '0'), $1
           from stg_sitadel
           where coalesce("SEC_CADASTRE${i}",'') <> '' and coalesce("NUM_CADASTRE${i}",'') <> ''
             and exists (select 1 from parcelles p where p.idu = "COMM" || '000' || lpad("SEC_CADASTRE${i}", 2, '0') || lpad("NUM_CADASTRE${i}", 4, '0'))
           on conflict do nothing`,
          [dep],
        );
      }
      const [{ n }] = await sql.unsafe<{ n: string }[]>(`select count(*) n from stg_sitadel`);
      total += Number(n);
      await sql`drop table if exists stg_sitadel`;
    }
    return { rows: total, sourceRef: "SDES Sitadel (DiDo) logements+locaux+démolir+aménager" };
  });
}
