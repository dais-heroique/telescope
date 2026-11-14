import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";
import { cachePath, download } from "./lib/download";
import { db, trackRun } from "./lib/db";
import { resolveResource } from "./lib/datagouv";
import { buildIdu } from "./lib/parsers";

type PmRow = {
  departement: string; code_insee: string; section: string; numero_parcelle: number; prefixe: string | null;
  numero_siren: string | null; denomination: string | null; forme_juridique_libelle: string | null; groupe_personne_libelle: string | null; millesime?: number;
};

/**
 * DGFiP — Fichiers des parcelles des personnes morales (version unifiée, Parquet ZSTD, ~376 Mo, 21 M lignes France).
 * Lecture par groupes de lignes, colonnes utiles uniquement, filtre département → ~19 s pour toute la France.
 * Aucune donnée de personne physique dans ce fichier.
 */
export async function ingestPersonnesMorales(dep: string) {
  return trackRun("personnes_morales", dep, async () => {
    const sql = db();
    const r = await resolveResource("fichiers-des-locaux-et-des-parcelles-des-personnes-morales-version-unifiee", (x) => /^parcelles_personnes_morales_latest/i.test(x.title));
    const file = await download(r.url, cachePath("national", "parcelles-personnes-morales-latest.parquet"));
    const buf = await asyncBufferFromFile(file);
    const metadata = await parquetMetadataAsync(buf);
    const columns = ["departement", "code_insee", "section", "numero_parcelle", "prefixe", "numero_siren", "denomination", "forme_juridique_libelle", "groupe_personne_libelle"];

    const map = new Map<string, { idu: string; siren: string; denomination: string | null; forme: string | null; groupe: string | null }>();
    let offset = 0;
    for (const rg of metadata.row_groups) {
      const n = Number(rg.num_rows);
      const rows = (await parquetReadObjects({ file: buf, metadata, compressors, columns, rowStart: offset, rowEnd: offset + n })) as PmRow[];
      offset += n;
      for (const x of rows) {
        if (x.departement !== dep || !x.numero_siren) continue;
        const idu = buildIdu(x.code_insee, x.section, x.numero_parcelle, x.prefixe);
        map.set(`${idu}|${x.numero_siren}`, { idu, siren: x.numero_siren, denomination: x.denomination, forme: x.forme_juridique_libelle, groupe: x.groupe_personne_libelle });
      }
    }
    const all = [...map.values()];
    await sql`delete from pm_parcelles where dep = ${dep}`;
    const BATCH = 5000;
    for (let i = 0; i < all.length; i += BATCH) {
      const b = all.slice(i, i + BATCH);
      await sql`
        insert into pm_parcelles (idu, siren, dep, denomination, forme_juridique, groupe_personne, millesime)
        select * from unnest(${b.map((x) => x.idu)}::text[], ${b.map((x) => x.siren)}::text[], ${b.map(() => dep)}::text[],
          ${b.map((x) => x.denomination)}::text[], ${b.map((x) => x.forme)}::text[], ${b.map((x) => x.groupe)}::text[], ${b.map(() => 2024)}::int[])
        on conflict do nothing`;
    }
    return { rows: all.length, sourceRef: r.url };
  });
}
