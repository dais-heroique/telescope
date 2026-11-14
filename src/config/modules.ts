import type { Filters } from "@/lib/filters";

export type ModuleId = "habitation" | "marchands" | "promoteurs" | "entreprise";

export interface ModuleConfig {
  id: ModuleId;
  label: string;
  short: string;
  description: string;
  /** Calques activés par défaut quand on choisit ce module. */
  defaultLayers: string[];
  /** Filtres rapides (puces) proposés dans le panneau Filtres pour ce module. */
  quickFilters: { label: string; filters: Filters }[];
}

export const MODULES: Record<ModuleId, ModuleConfig> = {
  habitation: {
    id: "habitation",
    label: "Habitation",
    short: "Agents & mandataires",
    description: "Prédictions de vente, carte des ventes DVF, courriers et pige.",
    defaultLayers: ["parcelles", "dvf", "score"],
    quickFilters: [
      { label: "Fort potentiel (≥ 60)", filters: { scoreMin: 60 } },
      { label: "Détention longue", filters: { detention: [10, null], usages: ["Résidentiel individuel", "Résidentiel collectif"] } },
      { label: "Passoires F/G", filters: { flags: ["passoire"] } },
      { label: "Maisons", filters: { usages: ["Résidentiel individuel"] } },
    ],
  },
  marchands: {
    id: "marchands",
    label: "Marchands de biens",
    short: "Divisions & monopropriétés",
    description: "Biens à diviser, immeubles en monopropriété, passoires à rénover, dents creuses.",
    defaultLayers: ["parcelles", "batiments", "dpe", "copros"],
    quickFilters: [
      { label: "Biens à diviser", filters: { flags: ["divisible"] } },
      { label: "Monopropriétés", filters: { flags: ["monopropriete"] } },
      { label: "Passoires à rénover", filters: { flags: ["passoire"] } },
      { label: "Dents creuses", filters: { flags: ["dent_creuse"] } },
    ],
  },
  promoteurs: {
    id: "promoteurs",
    label: "Promoteurs",
    short: "Recherche foncière",
    description: "Terrains en zone U/AU, agrégation de parcelles contiguës, constructibilité indicative.",
    defaultLayers: ["parcelles", "plu", "permis"],
    quickFilters: [
      { label: "Terrains constructibles (U/AU)", filters: { plu: ["U", "AU"], flags: ["dent_creuse"] } },
      { label: "Grandes emprises libres", filters: { plu: ["U", "AU"], surfLibre: [1500, null], surfParcelle: [2000, null] } },
      { label: "Permis récents autour", filters: { plu: ["U", "AU"], scoreMin: 40 } },
    ],
  },
  entreprise: {
    id: "entreprise",
    label: "Immobilier d'entreprise",
    short: "Bureaux, commerces, entrepôts",
    description: "DPE tertiaire, sociétés propriétaires et occupants, valeurs locatives, transactions de locaux.",
    defaultLayers: ["parcelles", "personnes-morales", "dvf"],
    quickFilters: [
      { label: "Bureaux / commerces", filters: { usages: ["Tertiaire"] } },
      { label: "Entrepôts / industrie", filters: { usages: ["Secondaire"] } },
      { label: "Détenus par une société", filters: { pm: "societes", usages: ["Tertiaire", "Secondaire"] } },
    ],
  },
};

export const MODULE_LIST = Object.values(MODULES);
