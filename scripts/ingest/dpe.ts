import { db, trackRun } from "./lib/db";
import { getJson } from "./lib/download";

interface DpeSource {
  kind: "existant" | "neuf" | "tertiaire";
  id: string;
  select: string[];
}

const COMMON = ["numero_dpe", "date_etablissement_dpe", "etiquette_dpe", "etiquette_ges", "annee_construction", "periode_construction", "adresse_ban", "identifiant_ban", "code_insee_ban", "_geopoint"];

export const DPE_SOURCES: DpeSource[] = [
  { kind: "existant", id: "dpe03existant", select: [...COMMON, "type_batiment", "surface_habitable_logement", "conso_5_usages_par_m2_ep"] },
  { kind: "neuf", id: "dpe02neuf", select: [...COMMON, "type_batiment", "surface_habitable_logement", "conso_5_usages_par_m2_ep"] },
  { kind: "tertiaire", id: "j9ol0fwjqckyf49vr29nknbu", select: [...COMMON, "secteur_activite", "surface_utile", "conso_kwhep_m2_an"] },
];

type Row = Record<string, string | number | null | undefined>;

const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : v ? Number(v) : null);

/** `_geopoint` = "lat,lon" → [lon, lat] */
export function parseGeopoint(v: unknown): [number, number] | null {
  if (typeof v !== "string") return null;
  const [lat, lon] = v.split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
}

/**
 * DPE ADEME via l'API Data-Fair (pagination par curseur `after`, 10 000 lignes/page).
 * Filtre département : `qs=code_departement_ban:{dep}`.
 */
export async function ingestDpe(dep: string) {
  return trackRun("dpe", dep, async () => {
    const sql = db();
    let total = 0;
    for (const src of DPE_SOURCES) {
      let url: string | null = `https://data.ademe.fr/data-fair/api/v1/datasets/${src.id}/lines?${new URLSearchParams({
        qs: `code_departement_ban:${dep}`,
        size: "5000",
        select: src.select.join(","),
      })}`;
      let n = 0;
      while (url) {
        const page: { results: Row[]; next?: string } = await getJson(url);
        const rows = page.results;
        if (!rows.length) break;
        const r = {
          num: rows.map((x) => str(x.numero_dpe)),
          date: rows.map((x) => str(x.date_etablissement_dpe)),
          dpe: rows.map((x) => str(x.etiquette_dpe)),
          ges: rows.map((x) => str(x.etiquette_ges)),
          type: rows.map((x) => str(x.type_batiment ?? x.secteur_activite)),
          annee: rows.map((x) => num(x.annee_construction)),
          periode: rows.map((x) => str(x.periode_construction)),
          surface: rows.map((x) => num(x.surface_habitable_logement ?? x.surface_utile)),
          conso: rows.map((x) => num(x.conso_5_usages_par_m2_ep ?? x.conso_kwhep_m2_an)),
          adresse: rows.map((x) => str(x.adresse_ban)),
          ban: rows.map((x) => str(x.identifiant_ban)),
          insee: rows.map((x) => str(x.code_insee_ban)),
          lon: rows.map((x) => parseGeopoint(x._geopoint)?.[0] ?? null),
          lat: rows.map((x) => parseGeopoint(x._geopoint)?.[1] ?? null),
        };
        await sql`
          insert into dpe (numero_dpe, kind, dep, insee, date_dpe, etiquette_dpe, etiquette_ges, type_batiment, annee_construction,
                           periode_construction, surface, conso_m2_ep, adresse, id_ban, geom)
          select t.num, ${src.kind}, ${dep}, t.insee, t.d::date, nullif(t.dpe,'')::char(1), nullif(t.ges,'')::char(1), t.type, t.annee::int,
                 t.periode, t.surface::numeric, t.conso::numeric, t.adresse, t.ban,
                 case when t.lon is not null then st_setsrid(st_makepoint(t.lon, t.lat), 4326) end
          from unnest(${r.num}::text[], ${r.date}::text[], ${r.dpe}::text[], ${r.ges}::text[], ${r.type}::text[], ${r.annee}::int[], ${r.periode}::text[],
                      ${r.surface}::numeric[], ${r.conso}::numeric[], ${r.adresse}::text[], ${r.ban}::text[], ${r.insee}::text[], ${r.lon}::float8[], ${r.lat}::float8[])
            as t(num, d, dpe, ges, type, annee, periode, surface, conso, adresse, ban, insee, lon, lat)
          where t.num is not null and t.dpe in ('A','B','C','D','E','F','G')
          on conflict (numero_dpe) do update set
            etiquette_dpe = excluded.etiquette_dpe, etiquette_ges = excluded.etiquette_ges, date_dpe = excluded.date_dpe,
            surface = excluded.surface, conso_m2_ep = excluded.conso_m2_ep, geom = excluded.geom`;
        n += rows.length;
        process.stdout.write(`  dpe ${src.kind} ${n}\r`);
        url = page.next ?? null;
      }
      total += n;
    }
    // Rattachement à la parcelle (jointure spatiale sur le point BAN)
    await sql`
      update dpe d set idu = p.idu
      from parcelles p
      where d.dep = ${dep} and d.geom is not null and p.dep = ${dep} and st_covers(p.geom, d.geom)`;
    await sql`analyze dpe`;
    return { rows: total, sourceRef: "data.ademe.fr dpe03existant+dpe02neuf+tertiaire" };
  });
}
