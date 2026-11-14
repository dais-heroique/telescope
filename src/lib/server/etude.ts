import type { Etude } from "@/lib/etude-types";
import { latToTileY, lonToTileX } from "@/lib/geo/tile-index";
import { pointInGeometry } from "@/lib/parcelle/geo";
import { cached, fetchJson, soft } from "./cache";
import { query } from "./db";
import { searchParcels } from "./search";

const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

export type EtudeScope = { insee: string } | { polygon: GeoJSON.Polygon };

/** Étude de marché d'une commune ou d'une zone dessinée : transactions, détention, DPE, démographie, parc social, permis. */
export async function buildEtude(scope: EtudeScope): Promise<Etude> {
  const notes: string[] = [];
  let label: string;
  let bb: [number, number, number, number] | null = null;
  let poly: GeoJSON.Polygon | null = null;
  let insee: string | null = null;

  if ("insee" in scope) {
    insee = scope.insee;
    const c = await soft(cached(`geo:commune:${insee}`, 30 * 86400, () => fetchJson<{ nom: string }>(`https://geo.api.gouv.fr/communes/${insee}?fields=nom`)));
    label = c?.nom ? `${c.nom} (${insee})` : `Commune ${insee}`;
  } else {
    poly = scope.polygon;
    const pts = poly.coordinates[0];
    bb = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    label = "Zone dessinée";
  }
  const inside = <T extends { lon: number | null; lat: number | null }>(rows: T[]) => (poly ? rows.filter((r) => r.lon !== null && r.lat !== null && pointInGeometry([r.lon, r.lat], poly!)) : rows);
  const bboxWhere = bb ? { sql: "tx between ? and ? and ty between ? and ? and lon between ? and ? and lat between ? and ?", args: [lonToTileX(bb[0], 12), lonToTileX(bb[2], 12), latToTileY(bb[3], 12), latToTileY(bb[1], 12), bb[0], bb[2], bb[1], bb[3]] } : null;

  // ── Transactions ──
  const dvf = inside(
    await query<{ d: string; t: string | null; p: number | null; lon: number | null; lat: number | null }>(
      `select date_mutation as d, type_principal as t, prix_m2 as p, lon, lat from dvf_mutations where nature = 'Vente' and ${insee ? "insee = ?" : bboxWhere!.sql}`,
      insee ? [insee] : bboxWhere!.args,
    ),
  );
  const types = ["Maison", "Appartement"];
  const byYearMap = new Map<number, { Maison: number[]; Appartement: number[]; nM: number; nA: number }>();
  for (const r of dvf) {
    if (!r.t || !types.includes(r.t)) continue;
    const y = Number(r.d.slice(0, 4));
    const e = byYearMap.get(y) ?? { Maison: [], Appartement: [], nM: 0, nA: 0 };
    if (r.t === "Maison") e.nM++; else e.nA++;
    if (r.p) e[r.t as "Maison" | "Appartement"].push(r.p);
    byYearMap.set(y, e);
  }
  const transactions: Etude["transactions"] = {
    total: dvf.length,
    byType: [...new Set(dvf.map((r) => r.t ?? "Autre"))].map((t) => ({ type: t, n: dvf.filter((r) => (r.t ?? "Autre") === t).length, median: median(dvf.filter((r) => r.t === t && r.p).map((r) => r.p!)) })).sort((a, b) => b.n - a.n),
    byYear: [...byYearMap.entries()].sort((a, b) => a[0] - b[0]).map(([year, e]) => ({ year, maison: { n: e.nM, median: median(e.Maison) }, appartement: { n: e.nA, median: median(e.Appartement) } })),
  };
  if (new Date().getMonth() < 12) notes.push("Les ventes DVF couvrent juillet 2021 → juin 2026 : les années 2021 et 2026 sont partielles.");

  // ── Parcelles : détention et DPE ──
  type P = { hold_years: number | null; nb_batiments: number; dpe_latest: string | null; lon: number; lat: number };
  let parcels: P[];
  if (insee) parcels = await query<P>("select hold_years, nb_batiments, dpe_latest, lon, lat from parcelles where insee = ?", [insee]);
  else parcels = (await searchParcels<P>({ filters: {}, polygon: poly as never, sort: "score", limit: 500, offset: 0 }, { columns: "f.hold_years, f.nb_batiments, f.dpe_latest, f.lon, f.lat", rawLimit: 200_000 })).rows;
  const built = parcels.filter((p) => p.nb_batiments > 0);
  const buckets = [["< 2 ans", 0, 2], ["2 – 5 ans", 2, 5], ["5 – 10 ans", 5, 10], ["10 ans et +", 10, Infinity]] as const;
  const detention = [...buckets.map(([label, a, b]) => ({ label, n: built.filter((p) => p.hold_years !== null && p.hold_years >= a && p.hold_years < b).length })), { label: "Pas de vente depuis 2021", n: built.filter((p) => p.hold_years === null).length }];
  const dpe = ["A", "B", "C", "D", "E", "F", "G"].map((l) => ({ label: l, n: parcels.filter((p) => p.dpe_latest === l).length }));

  // ── Permis ──
  const permisRows = inside(
    await query<{ y: string; nb: number | null; lon: number | null; lat: number | null }>(
      `select substr(date_autorisation, 1, 4) as y, nb_logements as nb, lon, lat from permis where date_autorisation is not null and type_dau in ('PC','DP','PA') and ${insee ? "insee = ?" : bboxWhere!.sql}`,
      insee ? [insee] : bboxWhere!.args,
    ),
  );
  const py = new Map<number, { n: number; logements: number }>();
  for (const r of permisRows) {
    const e = py.get(Number(r.y)) ?? { n: 0, logements: 0 };
    e.n++;
    e.logements += r.nb ?? 0;
    py.set(Number(r.y), e);
  }

  // ── Démographie et parc social (communes uniquement) ──
  let population: Etude["population"] = null;
  let social: Etude["social"] = null;
  if (insee) {
    const c = await soft(cached(`geo:commune:full:${insee}`, 30 * 86400, () => fetchJson<{ population?: number; surface?: number; codesPostaux?: string[] }>(`https://geo.api.gouv.fr/communes/${insee}?fields=population,surface,codesPostaux`)));
    if (c) {
      const km2 = c.surface ? c.surface / 100 : null;
      population = { population: c.population ?? null, surfaceKm2: km2 ? Math.round(km2 * 10) / 10 : null, densite: c.population && km2 ? Math.round(c.population / km2) : null, codesPostaux: c.codesPostaux ?? [] };
    }
    const n = await soft(
      cached(`rpls:${insee}`, 30 * 86400, async () => {
        const res = await fetch(`https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles/f3c2f2cb-8fb1-40fd-8733-964247744c9a/csv?${new URLSearchParams({ DEPCOM: `eq:${insee}`, columns: "DEPCOM" })}`, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`RPLS ${res.status}`);
        return Math.max(0, (await res.text()).trim().split("\n").length - 1);
      }),
    );
    social = { logements: n };
  } else notes.push("Démographie et parc social disponibles pour une étude de commune.");
  notes.push("Revenus (Filosofi) : non intégrés dans cette version.");

  return {
    label,
    generatedAt: new Date().toISOString(),
    population,
    parcelles: { total: parcels.length, baties: built.length },
    transactions,
    detention,
    dpe,
    permis: { byYear: [...py.entries()].sort((a, b) => a[0] - b[0]).map(([year, e]) => ({ year, ...e })), total: permisRows.length },
    social,
    notes,
  };
}
