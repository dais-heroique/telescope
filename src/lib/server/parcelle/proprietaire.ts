import type { OwnerEntity, OwnerReport, ParcelBase } from "@/lib/parcelle/types";
import { cached, fetchJson, soft } from "../cache";
import { query } from "../db";

const PUBLIC_RE = /^(commune|département|région|état|etat|établissements publics|office hlm|groupement)/i;

interface EntrepriseResult {
  results: { siren: string; nom_complet: string; nature_juridique: string; etat_administratif: string; date_creation: string | null; date_fermeture: string | null; siege: { adresse: string | null; activite_principale: string | null }; dirigeants?: { nom?: string; prenoms?: string; denomination?: string; qualite?: string }[] }[];
}

async function enrich(e: OwnerEntity): Promise<OwnerEntity> {
  const [ent, bod] = await Promise.all([
    soft(cached(`entreprise:${e.siren}`, 7 * 86400, () => fetchJson<EntrepriseResult>(`https://recherche-entreprises.api.gouv.fr/search?q=${e.siren}&per_page=1`))),
    soft(
      cached(`bodacc:${e.siren}`, 86400, async () => {
        const spaced = `${e.siren.slice(0, 3)} ${e.siren.slice(3, 6)} ${e.siren.slice(6, 9)}`;
        const q = new URLSearchParams({ where: `registre="${spaced}"`, limit: "10", order_by: "dateparution desc", select: "dateparution,typeavis_lib,familleavis_lib" });
        return fetchJson<{ results: { dateparution: string; typeavis_lib: string; familleavis_lib: string }[] }>(`https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records?${q}`);
      }),
    ),
  ]);
  const r = ent?.results.find((x) => x.siren === e.siren);
  return {
    ...e,
    etat: r?.etat_administratif === "C" ? "Cessée" : r ? "Active" : null,
    creation: r?.date_creation ?? null,
    fermeture: r?.date_fermeture ?? null,
    siege: r?.siege?.adresse ?? null,
    naf: r?.siege?.activite_principale ?? null,
    // Dirigeants : informations légales publiques (RNE), affichées à la demande, jamais stockées ni exportées.
    dirigeants: (r?.dirigeants ?? []).slice(0, 6).map((d) => ({ qualite: d.qualite ?? null, nom: d.denomination ?? `${d.prenoms ?? ""} ${d.nom ?? ""}`.trim() })),
    annonces: (bod?.results ?? []).map((a) => ({ date: a.dateparution, type: a.typeavis_lib, famille: a.familleavis_lib })),
  };
}

export async function getProprietaire(base: ParcelBase): Promise<OwnerReport> {
  const address = base.address ?? `${base.section} ${base.numero}, ${base.commune ?? base.insee}`;
  if (base.mode !== "imported") {
    return {
      type: "inconnu",
      entities: [],
      copro: null,
      publicOwner: false,
      courrier: { destinataire: "Au propriétaire", adresse: address },
      note: "Département non importé : la propriété (personnes morales, copropriété) n'est disponible que sur les départements importés. Un courrier « Au propriétaire » reste possible.",
    };
  }
  const pm = await query<{ siren: string; denomination: string | null; forme_juridique: string | null; groupe_personne: string | null }>("select siren, denomination, forme_juridique, groupe_personne from pm_parcelles where idu = ? order by (groupe_personne = 'personnes morales non remarquables') desc limit 8", [base.idu]);
  const copro = await query<{ numero: string; nom: string | null; nb_lots: number | null }>("select c.numero, c.nom, c.nb_lots from rnic_parcelles rp join rnic_copros c using (numero) where rp.idu = ? limit 1", [base.idu]);
  const entities = await Promise.all(pm.slice(0, 4).map((r) => enrich({ siren: r.siren, denomination: r.denomination, forme: r.forme_juridique, groupe: r.groupe_personne })));
  const main = entities[0];
  const isPublic = Boolean(main?.groupe && PUBLIC_RE.test(main.groupe));
  return {
    type: pm.length ? "personne_morale" : "particulier",
    entities,
    copro: copro[0] ? { numero: copro[0].numero, nom: copro[0].nom, lots: copro[0].nb_lots } : null,
    publicOwner: isPublic,
    courrier: pm.length
      ? { destinataire: `À l'attention du représentant légal de ${main.denomination ?? main.siren}`, adresse: main.siege ?? address }
      : { destinataire: "Au propriétaire", adresse: address },
    note: pm.length
      ? "Propriété d'une personne morale (fichiers DGFiP des personnes morales)."
      : "Propriétaire particulier : aucune donnée nominative n'est disponible en open data (RGPD). Le courrier est adressé « Au propriétaire » à l'adresse du bien.",
  };
}
