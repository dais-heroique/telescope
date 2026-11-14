import type { ParcelBase, RiskItem, RiskReport } from "@/lib/parcelle/types";
import { cached, fetchJson, soft } from "../cache";

const G = "https://georisques.gouv.fr/api/v1";
type Paged<T> = { data: T[] };

export async function getRisques(base: ParcelBase): Promise<RiskReport> {
  const [lon, lat] = base.centroid;
  const ll = `${lon},${lat}`;
  const insee = base.insee;
  return cached(`georisques:${insee}:${lon.toFixed(4)},${lat.toFixed(4)}`, 30 * 86400, async () => {
    const [gaspar, rga, radon, seisme, azi, mvt, icpe] = await Promise.all([
      soft(fetchJson<Paged<{ risques_detail: { libelle_risque_long: string }[] }>>(`${G}/gaspar/risques?code_insee=${insee}`)),
      soft(fetchJson<{ exposition?: string; codeExposition?: string }>(`${G}/rga?latlon=${ll}`)),
      soft(fetchJson<Paged<{ classe_potentiel: string }>>(`${G}/radon?code_insee=${insee}`)),
      soft(fetchJson<Paged<{ zone_sismicite: string }>>(`${G}/zonage_sismique?code_insee=${insee}`)),
      soft(fetchJson<Paged<{ libelle_azi: string }>>(`${G}/gaspar/azi?latlon=${ll}&rayon=100`)),
      soft(fetchJson<Paged<{ type: string; fiabilite?: string; date_debut?: string }>>(`${G}/mvt?latlon=${ll}&rayon=500`)),
      soft(fetchJson<Paged<{ raisonSociale: string; regime?: string; distance?: number }>>(`${G}/installations_classees?latlon=${ll}&rayon=1000&page_size=20`)),
    ]);
    const items: RiskItem[] = [];
    if (azi?.data.length) items.push({ label: "Zone inondable (atlas)", level: "Parcelle dans l'emprise", detail: azi.data.map((a) => a.libelle_azi).join(" ; ") });
    if (rga?.exposition) items.push({ label: "Retrait-gonflement des argiles", level: rga.exposition });
    if (seisme?.data[0]) items.push({ label: "Sismicité", level: seisme.data[0].zone_sismicite });
    if (radon?.data.length) items.push({ label: "Potentiel radon (commune)", level: `Classe ${Math.max(...radon.data.map((r) => Number(r.classe_potentiel)))}` });
    if (mvt?.data.length) items.push({ label: "Mouvements de terrain (500 m)", level: `${mvt.data.length} événement(s)`, detail: [...new Set(mvt.data.map((m) => m.type))].join(", ") });
    const communeRisks = [...new Set((gaspar?.data ?? []).flatMap((g) => g.risques_detail.map((r) => r.libelle_risque_long)))];
    if (communeRisks.length) items.push({ label: "Risques recensés sur la commune", detail: communeRisks.join(" ; ") });
    return {
      items,
      icpe: (icpe?.data ?? []).map((i) => ({ nom: i.raisonSociale, distance: i.distance ?? null, regime: i.regime ?? null })),
      source: "Géorisques",
    } satisfies RiskReport;
  });
}
