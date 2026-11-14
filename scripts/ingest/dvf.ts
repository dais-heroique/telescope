import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { cachePath, download } from "./lib/download";
import { copyCsvToStaging } from "./lib/copy";
import { db, trackRun } from "./lib/db";
import { resolveResource } from "./lib/datagouv";

const COLS = [
  "id_mutation", "date_mutation", "numero_disposition", "nature_mutation", "valeur_fonciere", "adresse_numero", "adresse_suffixe",
  "adresse_nom_voie", "code_postal", "code_commune", "code_departement", "id_parcelle", "type_local", "surface_reelle_bati",
  "nombre_pieces_principales", "surface_terrain", "nombre_lots", "longitude", "latitude",
];

/** Années DVF disponibles : juillet 2021 → année courante (5 dernières années + semestre en cours). */
function years(): number[] {
  const y = new Date().getFullYear();
  const out: number[] = [];
  for (let i = y - 5; i <= y; i++) if (i >= 2021) out.push(i);
  return out;
}

/** Fichier département (rapide) ; repli sur le fichier national `full-{année}.csv.gz` filtré. */
async function fetchYear(dep: string, year: number): Promise<{ file: string; national: boolean } | null> {
  const dest = cachePath(dep, `dvf-${year}.csv.gz`);
  try {
    await download(`https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/departements/${dep}.csv.gz`, dest, { retries: 2 });
    return { file: dest, national: false };
  } catch {
    try {
      const r = await resolveResource("demandes-de-valeurs-foncieres-geolocalisees", (x) => new RegExp(`^DVF ${year}\\b`).test(x.title) && x.format.includes("csv"));
      const natDest = cachePath("national", `dvf-full-${year}.csv.gz`);
      await download(r.url, natDest);
      return { file: natDest, national: true };
    } catch (e) {
      console.warn(`  DVF ${year} indisponible (${e instanceof Error ? e.message : e}) — ignoré`);
      return null;
    }
  }
}

export async function ingestDvf(dep: string) {
  return trackRun("dvf", dep, async () => {
    const sql = db();
    let first = true;
    let lines = 0;
    const used: number[] = [];
    for (const y of years()) {
      const src = await fetchYear(dep, y);
      if (!src) continue;
      const n = await copyCsvToStaging(sql, "stg_dvf", createReadStream(src.file).pipe(createGunzip()), {
        select: COLS,
        append: !first,
        filter: src.national ? (r) => r.code_departement === dep : undefined,
      });
      first = false;
      lines += n;
      used.push(y);
    }
    if (first) throw new Error("aucun fichier DVF disponible");

    // Nettoyage + agrégation par mutation (règles identiques à summarizeMutation, cf. lib/parsers.ts).
    await sql`delete from dvf_mutation_parcelles where dep = ${dep}`;
    await sql`
      with disp as (
        select id_mutation, numero_disposition,
               max(nullif(valeur_fonciere, '')::numeric) as valeur
        from stg_dvf group by 1, 2
      ), val as (
        select id_mutation, sum(valeur) as valeur from disp group by 1
      ), agg as (
        select s.id_mutation,
               max(s.code_commune) as insee,
               min(s.date_mutation)::date as date_mutation,
               max(s.nature_mutation) as nature,
               max(nullif(trim(coalesce(s.adresse_numero,'') || ' ' || coalesce(s.adresse_suffixe,'') || ' ' || coalesce(s.adresse_nom_voie,'')), '')) as adresse,
               sum(nullif(s.surface_reelle_bati,'')::numeric) filter (where s.type_local in ('Maison','Appartement')) as surf_res,
               sum(nullif(s.surface_reelle_bati,'')::numeric) as surf_tot,
               sum(nullif(s.surface_terrain,'')::numeric) as terrain,
               max(nullif(s.nombre_lots,'')::int) as nb_lots,
               count(distinct s.id_parcelle) as nb_parcelles,
               array_remove(array_agg(distinct nullif(s.type_local,'')), null) as types,
               bool_or(s.type_local = 'Appartement') as has_app,
               bool_or(s.type_local = 'Maison') as has_mai,
               bool_or(s.type_local like 'Local industriel%') as has_com,
               bool_and(coalesce(s.type_local,'') = '') as no_local,
               max(nullif(s.nombre_pieces_principales,'')::int) filter (where s.type_local in ('Maison','Appartement')) as pieces,
               (array_agg(st_setsrid(st_makepoint(s.longitude::float8, s.latitude::float8), 4326))
                  filter (where s.longitude <> '' and s.latitude <> ''))[1] as geom
        from stg_dvf s group by 1
      )
      insert into dvf_mutations (id_mutation, dep, insee, date_mutation, nature, valeur_fonciere, adresse, surface_bati_res, surface_bati_tot,
                                 surface_terrain, nb_lots, nb_parcelles, types_locaux, type_principal, nb_pieces, prix_m2, geom)
      select a.id_mutation, ${dep}, a.insee, a.date_mutation, a.nature, v.valeur, a.adresse, a.surf_res, a.surf_tot, a.terrain, a.nb_lots,
             a.nb_parcelles, a.types,
             case when a.has_app then 'Appartement' when a.has_mai then 'Maison'
                  when a.has_com then 'Local industriel. commercial ou assimilé'
                  when a.no_local and coalesce(a.terrain,0) > 0 then 'Terrain' else 'Autre' end,
             a.pieces,
             case when a.nature = 'Vente' and v.valeur > 0 and a.surf_res > 9 and not a.has_com
                  then round(v.valeur / a.surf_res, 2)
                  -- locaux d'activité seuls (ni maison ni appartement) : prix rapporté à la surface bâtie totale
                  when a.nature = 'Vente' and v.valeur > 0 and a.has_com and not a.has_app and not a.has_mai and a.surf_tot > 9
                  then round(v.valeur / a.surf_tot, 2) end,
             a.geom
      from agg a join val v using (id_mutation)
      on conflict (id_mutation) do update set
        valeur_fonciere = excluded.valeur_fonciere, nature = excluded.nature, surface_bati_res = excluded.surface_bati_res,
        surface_bati_tot = excluded.surface_bati_tot, surface_terrain = excluded.surface_terrain, nb_lots = excluded.nb_lots,
        nb_parcelles = excluded.nb_parcelles, types_locaux = excluded.types_locaux, type_principal = excluded.type_principal,
        nb_pieces = excluded.nb_pieces, prix_m2 = excluded.prix_m2, geom = excluded.geom, adresse = excluded.adresse`;
    await sql`
      insert into dvf_mutation_parcelles (id_mutation, idu, dep)
      select distinct id_mutation, id_parcelle, ${dep} from stg_dvf where length(id_parcelle) = 14
      on conflict do nothing`;
    const [{ n }] = await sql<{ n: string }[]>`select count(*) n from dvf_mutations where dep = ${dep}`;
    await sql`drop table if exists stg_dvf`;
    return { rows: Number(n), sourceRef: `geo-dvf ${used.join(",")} (${lines} lignes)` };
  });
}
