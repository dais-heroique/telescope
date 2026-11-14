import type { BusinessReport, Occupant, ParcelBase } from "@/lib/parcelle/types";
import { cached, fetchJson } from "../cache";
import { query } from "../db";

interface NearPoint {
  results: {
    siren: string;
    nom_complet: string;
    siege: { siret: string };
    matching_etablissements?: { siret: string; adresse: string | null; activite_principale: string | null; etat_administratif: string; date_creation: string | null; tranche_effectif_salarie: string | null; nom_commercial?: string | null }[];
  }[];
}

/** Occupants (établissements actifs SIRENE) autour du bien — personnes morales/entreprises uniquement — et DPE tertiaire rattachés. */
export async function getEntreprise(base: ParcelBase, radiusM = 40): Promise<BusinessReport> {
  const [lon, lat] = base.centroid;
  const j = await cached(`sirene:near:${lon.toFixed(5)},${lat.toFixed(5)}:${radiusM}`, 7 * 86400, () =>
    fetchJson<NearPoint>(`https://recherche-entreprises.api.gouv.fr/near_point?lat=${lat}&long=${lon}&radius=${radiusM / 1000}&per_page=25&etat_administratif=A`, { timeoutMs: 12000 }),
  ).catch(() => ({ results: [] }) as NearPoint);
  const occupants: Occupant[] = j.results.flatMap((r) =>
    (r.matching_etablissements ?? [])
      .filter((e) => e.etat_administratif === "A")
      .map((e) => ({ siren: r.siren, siret: e.siret, name: e.nom_commercial || r.nom_complet, adresse: e.adresse, naf: e.activite_principale, effectif: e.tranche_effectif_salarie, since: e.date_creation, isSiege: e.siret === r.siege?.siret })),
  );
  const dpeTertiaire =
    base.mode === "imported"
      ? (await query<{ numero_dpe: string; date_dpe: string | null; etiquette_dpe: string; type_batiment: string | null; surface: number | null; adresse: string | null }>("select numero_dpe, date_dpe, etiquette_dpe, type_batiment, surface, adresse from dpe where idu = ? and kind = 'tertiaire' order by date_dpe desc limit 20", [base.idu])).map((r) => ({ numero: r.numero_dpe, date: r.date_dpe, etiquette: r.etiquette_dpe, secteur: r.type_batiment, surface: r.surface, adresse: r.adresse }))
      : [];
  return { occupants, dpeTertiaire, radius: radiusM };
}
