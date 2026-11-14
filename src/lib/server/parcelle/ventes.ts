import { parse } from "csv-parse/sync";
import { summarizeMutation, toNumber } from "@/lib/data/parsers";
import { haversine } from "@/lib/parcelle/geo";
import type { ParcelBase, Sale, SalesReport } from "@/lib/parcelle/types";
import { cached } from "../cache";
import { query } from "../db";
import { POINT_LEVEL } from "../data-schema";
import { latToTileY, lonToTileX } from "@/lib/geo/tile-index";

function median(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}
function quantile(a: number[], q: number): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
}

export function buildStats(sales: Sale[]) {
  const prices = sales.map((s) => s.prixM2).filter((x): x is number => x !== null);
  const years = new Map<number, number[]>();
  for (const s of sales) if (s.prixM2 !== null) years.set(Number(s.date.slice(0, 4)), [...(years.get(Number(s.date.slice(0, 4))) ?? []), s.prixM2]);
  return {
    stats: { n: sales.length, medianPrixM2: median(prices), p25: quantile(prices, 0.25), p75: quantile(prices, 0.75) },
    byYear: [...years.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, n: v.length, medianPrixM2: median(v) })),
  };
}

interface LiveSale extends Sale {
  idus: string[];
}

/** Mode à la demande : fichier DVF communal (Etalab) pour chaque année disponible, agrégé par mutation. */
async function communeSales(insee: string): Promise<LiveSale[]> {
  return cached(`dvf:commune:${insee}`, 7 * 86400, async () => {
    const dep = insee.startsWith("97") ? insee.slice(0, 3) : insee.slice(0, 2);
    const y = new Date().getFullYear();
    const out: LiveSale[] = [];
    for (let year = Math.max(2021, y - 5); year <= y; year++) {
      const res = await fetch(`https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/communes/${dep}/${insee}.csv`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const rows = parse(await res.text(), { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<string, string>[];
      const byMut = new Map<string, Record<string, string>[]>();
      for (const r of rows) byMut.set(r.id_mutation, [...(byMut.get(r.id_mutation) ?? []), r]);
      for (const [id, rs] of byMut) {
        const s = summarizeMutation(rs.map((r) => ({ type_local: r.type_local, surface_reelle_bati: r.surface_reelle_bati, valeur_fonciere: r.valeur_fonciere, nature_mutation: r.nature_mutation, surface_terrain: r.surface_terrain })));
        const first = rs[0];
        const lonlat = rs.find((r) => r.longitude && r.latitude);
        // Plusieurs dispositions : une valeur par disposition (même règle que l'import)
        const perDisp = new Map<string, number>();
        for (const r of rs) perDisp.set(r.numero_disposition, Math.max(perDisp.get(r.numero_disposition) ?? 0, toNumber(r.valeur_fonciere) ?? 0));
        const valeur = [...perDisp.values()].reduce((a, b) => a + b, 0);
        out.push({
          id,
          date: first.date_mutation,
          nature: first.nature_mutation,
          valeur: valeur || null,
          prixM2: valeur > 0 && s.prix_m2 !== null ? Math.round((valeur / (s.surface_bati_res ?? 1)) * 100) / 100 : null,
          type: s.type_principal,
          surfaceBati: s.surface_bati_res,
          surfaceTerrain: rs.reduce((a, r) => a + (toNumber(r.surface_terrain) ?? 0), 0) || null,
          pieces: toNumber(rs.find((r) => r.nombre_pieces_principales && r.nombre_pieces_principales !== "0")?.nombre_pieces_principales) ?? null,
          adresse: [first.adresse_numero, first.adresse_suffixe, first.adresse_nom_voie].filter(Boolean).join(" ") || null,
          lon: lonlat ? Number(lonlat.longitude) : null,
          lat: lonlat ? Number(lonlat.latitude) : null,
          idus: [...new Set(rs.map((r) => r.id_parcelle))],
        });
      }
    }
    return out;
  });
}

export async function getVentes(base: ParcelBase, radius = 500, type?: string): Promise<SalesReport> {
  radius = Math.min(Math.max(radius, 50), 3000);
  let parcel: Sale[];
  let comparables: Sale[];

  if (base.mode === "imported") {
    type R = { id: string; d: string; nature: string | null; v: number | null; pm2: number | null; t: string | null; sb: number | null; st: number | null; np: number | null; adr: string | null; lon: number | null; lat: number | null };
    const map = (r: R): Sale => ({ id: r.id, date: r.d, nature: r.nature, valeur: r.v, prixM2: r.pm2, type: r.t, surfaceBati: r.sb, surfaceTerrain: r.st, pieces: r.np, adresse: r.adr, lon: r.lon, lat: r.lat });
    const cols = "m.id_mutation as id, m.date_mutation as d, m.nature, m.valeur_fonciere as v, m.prix_m2 as pm2, m.type_principal as t, m.surface_bati_res as sb, m.surface_terrain as st, m.nb_pieces as np, m.adresse as adr, m.lon, m.lat";
    parcel = (await query<R>(`select ${cols} from dvf_mutation_parcelles mp join dvf_mutations m using (id_mutation) where mp.idu = ? order by m.date_mutation desc`, [base.idu])).map(map);
    const [lon, lat] = base.centroid;
    const dLat = radius / 110574, dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
    const rows = await query<R>(
      `select ${cols} from dvf_mutations m
       where m.tx between ? and ? and m.ty between ? and ? and m.lon between ? and ? and m.lat between ? and ?
         and m.nature = 'Vente' and m.prix_m2 is not null ${type ? "and m.type_principal = ?" : "and m.type_principal in ('Maison', 'Appartement')"}`,
      [lonToTileX(lon - dLon, POINT_LEVEL), lonToTileX(lon + dLon, POINT_LEVEL), latToTileY(lat + dLat, POINT_LEVEL), latToTileY(lat - dLat, POINT_LEVEL), lon - dLon, lon + dLon, lat - dLat, lat + dLat, ...(type ? [type] : [])],
    );
    comparables = rows
      .map((r) => ({ ...map(r), distance: haversine(base.centroid, [r.lon!, r.lat!]) }))
      .filter((s) => s.distance <= radius)
      .sort((a, b) => b.date.localeCompare(a.date));
  } else {
    const all = await communeSales(base.insee);
    parcel = all.filter((s) => s.idus.includes(base.idu)).sort((a, b) => b.date.localeCompare(a.date));
    comparables = all
      .filter((s) => s.lon !== null && s.lat !== null && s.nature === "Vente" && s.prixM2 !== null && (type ? s.type === type : s.type === "Maison" || s.type === "Appartement"))
      .map((s) => ({ ...s, distance: haversine(base.centroid, [s.lon!, s.lat!]) }))
      .filter((s) => s.distance <= radius)
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  const { stats, byYear } = buildStats(comparables);
  return { parcel, comparables: comparables.slice(0, 300), radius, stats, byYear };
}
