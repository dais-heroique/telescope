import { db, trackRun } from "./lib/db";
import { getJson } from "./lib/download";

interface Feature {
  id: string;
  geometry: unknown;
  properties: { gid: number; partition: string; typezone: string; libelle: string; libelong: string; urlfic: string; datappro: string | null; datvalid?: string | null };
}

/** Parse "AAAAMMJJ" ou "AAAA-MM-JJ" → ISO ou null. */
export function parseGpuDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Zonages PLU/PLUi du Géoportail de l'Urbanisme via WFS Géoplateforme.
 * Filtre : emprise des parcelles du département, découpée en grille (pas de gros téléchargement).
 * ⚠️ En WFS 2.0 / EPSG:4326 l'ordre des axes du BBOX est (lat, lon).
 */
export async function ingestPlu(dep: string) {
  return trackRun("plu", dep, async () => {
    const sql = db();
    const [ext] = await sql<{ minx: number; miny: number; maxx: number; maxy: number }[]>`
      select st_xmin(e)::float8 minx, st_ymin(e)::float8 miny, st_xmax(e)::float8 maxx, st_ymax(e)::float8 maxy
      from (select st_extent(geom) e from parcelles where dep = ${dep}) s`;
    if (ext?.minx == null) throw new Error("aucune parcelle importée : lancer le cadastre avant le PLU");

    const GRID = 6;
    const dx = (ext.maxx - ext.minx) / GRID;
    const dy = (ext.maxy - ext.miny) / GRID;
    let total = 0;
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const [x0, y0, x1, y1] = [ext.minx + i * dx, ext.miny + j * dy, ext.minx + (i + 1) * dx, ext.miny + (j + 1) * dy];
        for (let start = 0; ; start += 1000) {
          const q = new URLSearchParams({
            SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature", TYPENAMES: "wfs_du:zone_urba", OUTPUTFORMAT: "application/json",
            COUNT: "1000", STARTINDEX: String(start), SORTBY: "gid",
            PROPERTYNAME: "gid,partition,typezone,libelle,libelong,urlfic,datappro,datvalid,the_geom",
            CQL_FILTER: `BBOX(the_geom,${y0},${x0},${y1},${x1})`,
          });
          const page = await getJson<{ features: Feature[] }>(`https://data.geopf.fr/wfs/ows?${q}`);
          const fs = page.features;
          if (!fs.length) break;
          await sql`
            insert into plu_zones (gid, dep, partition, typezone, libelle, libelong, urlfic, datappro, geom)
            select t.gid, ${dep}, t.part, t.typezone, t.libelle, t.libelong, nullif(t.urlfic,''), t.d::date,
                   st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(t.g), 4326)), 3))
            from unnest(${fs.map((f) => String(f.properties.gid))}::text[], ${fs.map((f) => f.properties.partition)}::text[],
                        ${fs.map((f) => f.properties.typezone)}::text[], ${fs.map((f) => f.properties.libelle)}::text[],
                        ${fs.map((f) => f.properties.libelong)}::text[], ${fs.map((f) => f.properties.urlfic ?? "")}::text[],
                        ${fs.map((f) => parseGpuDate(f.properties.datappro ?? f.properties.datvalid))}::text[],
                        ${fs.map((f) => JSON.stringify(f.geometry))}::text[])
              as t(gid, part, typezone, libelle, libelong, urlfic, d, g)
            on conflict (gid) do update set typezone = excluded.typezone, libelle = excluded.libelle, libelong = excluded.libelong,
              urlfic = excluded.urlfic, datappro = excluded.datappro, geom = excluded.geom`;
          total += fs.length;
          process.stdout.write(`  plu ${total}\r`);
          if (fs.length < 1000) break;
        }
      }
    }
    await sql`analyze plu_zones`;
    return { rows: total, sourceRef: "WFS wfs_du:zone_urba" };
  });
}
