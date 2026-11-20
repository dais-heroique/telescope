import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { cachePath, download } from "./lib/download";
import { db, trackRun } from "./lib/db";
import { parseIdu } from "./lib/parsers";

/**
 * Cadastre Etalab : parcelles GeoJSON du département (une Feature par ligne → lecture en flux, mémoire constante).
 * Source : https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements/{dep}/cadastre-{dep}-parcelles.json.gz
 */
export async function ingestCadastre(dep: string) {
  return trackRun("cadastre", dep, async () => {
    const url = `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements/${dep}/cadastre-${dep}-parcelles.json.gz`;
    const file = await download(url, cachePath(dep, `cadastre-${dep}-parcelles.json.gz`));
    const sql = db();

    const BATCH = 1500;
    let idus: string[] = [], insees: string[] = [], prefs: string[] = [], secs: string[] = [], nums: string[] = [], cont: number[] = [], geoms: string[] = [];
    let total = 0;

    const flush = async () => {
      if (!idus.length) return;
      await sql`
        insert into parcelles (idu, dep, insee, prefixe, section, numero, contenance, geom)
        select t.idu, ${dep}, t.insee, t.prefixe, t.section, t.numero, t.contenance,
               st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(t.g), 4326)), 3))
        from unnest(${idus}::text[], ${insees}::text[], ${prefs}::text[], ${secs}::text[], ${nums}::text[], ${cont}::int[], ${geoms}::text[])
          as t(idu, insee, prefixe, section, numero, contenance, g)
        on conflict (idu) do update set
          contenance = excluded.contenance, geom = excluded.geom, prefixe = excluded.prefixe`;
      total += idus.length;
      idus = []; insees = []; prefs = []; secs = []; nums = []; cont = []; geoms = [];
      if (total % 30000 < BATCH) process.stdout.write(`  cadastre ${total}\r`);
    };

    const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const raw of rl) {
      let line = raw.trim().replace(/,$/, "");
      if (line.endsWith("}}]}")) line = line.slice(0, -2); // dernière ligne du FeatureCollection : "…}}]}"
      if (!line.startsWith('{"type":"Feature"')) continue;
      const f = JSON.parse(line) as { id?: string; geometry: unknown; properties: Record<string, unknown> };
      const idu = String(f.id ?? f.properties.id ?? "");
      const p = parseIdu(idu);
      if (!p || !f.geometry) continue;
      idus.push(idu);
      insees.push(p.insee);
      prefs.push(p.prefixe);
      secs.push(p.section);
      nums.push(p.numero);
      cont.push(Math.round(Number(f.properties.contenance ?? 0)) || 0);
      geoms.push(JSON.stringify(f.geometry));
      if (idus.length >= BATCH) await flush();
    }
    await flush();
    await sql`analyze parcelles`;
    return { rows: total, sourceRef: url };
  });
}

/**
 * Bâtiments du cadastre Etalab (une Feature par ligne). Utilisés uniquement pour les détections (parcelle bâtie ou non,
 * surface libre réelle) : la BDNB ignore une partie des annexes et des constructions récentes.
 */
export async function ingestCadastreBatiments(dep: string) {
  return trackRun("cadastre_batiments", dep, async () => {
    const url = `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements/${dep}/cadastre-${dep}-batiments.json.gz`;
    const file = await download(url, cachePath(dep, `cadastre-${dep}-batiments.json.gz`));
    const sql = db();
    await sql`delete from cad_batiments where dep = ${dep}`;
    let types: string[] = [], geoms: string[] = [];
    let total = 0;
    const flush = async () => {
      if (!geoms.length) return;
      await sql`
        insert into cad_batiments (dep, type, geom)
        select ${dep}, t.type, st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(t.g), 4326)), 3))
        from unnest(${types}::text[], ${geoms}::text[]) as t(type, g)`;
      total += geoms.length;
      types = []; geoms = [];
      if (total % 50000 < 2000) process.stdout.write(`  cadastre bâtiments ${total}\r`);
    };
    const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const raw of rl) {
      let line = raw.trim().replace(/,$/, "");
      if (line.endsWith("}}]}")) line = line.slice(0, -2);
      if (!line.startsWith('{"type":"Feature"')) continue;
      const f = JSON.parse(line) as { geometry: unknown; properties: Record<string, unknown> };
      if (!f.geometry) continue;
      types.push(String(f.properties.type ?? ""));
      geoms.push(JSON.stringify(f.geometry));
      if (geoms.length >= 2000) await flush();
    }
    await flush();
    await sql`delete from cad_batiments where dep = ${dep} and st_isempty(geom)`;
    await sql`analyze cad_batiments`;
    return { rows: total, sourceRef: url };
  });
}
