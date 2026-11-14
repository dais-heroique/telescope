import { Readable } from "node:stream";
import { copyCsvToStaging } from "./lib/copy";
import { db, trackRun } from "./lib/db";
import { resolveResource } from "./lib/datagouv";

const FILES: { type: "appartement" | "appartement_t1_t2" | "appartement_t3_plus" | "maison"; match: RegExp }[] = [
  { type: "appartement", match: /^Indicateurs de loyer appartement$/i },
  { type: "appartement_t1_t2", match: /appartement de 1 ou 2/i },
  { type: "appartement_t3_plus", match: /appartement de 3 pi/i },
  { type: "maison", match: /^Indicateurs de loyer maison$/i },
];
const SLUG = "carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025";

/** Carte des loyers 2025 (Latin-1, séparateur `;`, décimale `,`). Données nationales, filtrées par département. */
export async function ingestLoyers(dep: string) {
  return trackRun("loyers", dep, async () => {
    const sql = db();
    let total = 0;
    await sql`delete from loyers_communes where annee = 2025 and insee like ${dep + "%"}`;
    for (const f of FILES) {
      const r = await resolveResource(SLUG, (x) => f.match.test(x.title) && x.format === "csv");
      const res = await fetch(r.url);
      if (!res.ok || !res.body) throw new Error(`loyers ${f.type}: HTTP ${res.status}`);
      await copyCsvToStaging(sql, "stg_loyers", Readable.fromWeb(res.body as never), {
        delimiter: ";", encoding: "latin1", select: ["INSEE_C", "DEP", "loypredm2", "lwr.IPm2", "upr.IPm2", "TYPPRED"],
        filter: (row) => row.DEP === dep,
      });
      await sql.unsafe(
        `insert into loyers_communes (insee, type_bien, loyer_m2, loyer_m2_min, loyer_m2_max, fiabilite, annee)
         select "INSEE_C", $1, replace("loypredm2", ',', '.')::numeric, replace("lwr.IPm2", ',', '.')::numeric, replace("upr.IPm2", ',', '.')::numeric, "TYPPRED", 2025
         from stg_loyers where "loypredm2" <> '' on conflict do nothing`,
        [f.type],
      );
      const [{ n }] = await sql.unsafe<{ n: string }[]>(`select count(*) n from stg_loyers`);
      total += Number(n);
    }
    await sql`drop table if exists stg_loyers`;
    return { rows: total, sourceRef: "carte des loyers 2025" };
  });
}

/**
 * LOVAC agrégé communal (open data, Latin-1). « s » = secret statistique.
 * Taux de vacance = logements vacants du parc privé / parc privé, à la même date de référence (01/01/2024).
 */
export async function ingestVacance(dep: string) {
  return trackRun("vacance", dep, async () => {
    const sql = db();
    const r = await resolveResource("logements-vacants-du-parc-prive-par-commune-departement-region-france-de-2020-a-2026", (x) => /Communes\.csv$/i.test(x.title));
    const res = await fetch(r.url);
    if (!res.ok || !res.body) throw new Error(`LOVAC: HTTP ${res.status}`);
    const n = await copyCsvToStaging(sql, "stg_lovac", Readable.fromWeb(res.body as never), {
      delimiter: ";", encoding: "latin1", select: ["CODGEO_26", "pp_vacant_25", "ff_pp_total_25", "DEP"], filter: (row) => row.DEP === dep,
    });
    await sql`delete from vacance_communes where insee like ${dep + "%"}`;
    await sql`
      insert into vacance_communes (insee, annee, logements_total, logements_vacants, taux_vacance)
      select "CODGEO_26", 2024, nullif("ff_pp_total_25", 's')::int, nullif("pp_vacant_25", 's')::int,
             case when nullif("ff_pp_total_25",'s')::numeric > 0 and nullif("pp_vacant_25",'s') is not null
                  then round(100 * "pp_vacant_25"::numeric / "ff_pp_total_25"::numeric, 2) end
      from stg_lovac on conflict (insee) do update set taux_vacance = excluded.taux_vacance, logements_total = excluded.logements_total, logements_vacants = excluded.logements_vacants`;
    await sql`drop table if exists stg_lovac`;
    return { rows: n, sourceRef: r.url };
  });
}
