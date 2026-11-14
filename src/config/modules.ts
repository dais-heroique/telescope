export type ModuleId = "habitation" | "marchands" | "promoteurs" | "entreprise";

export interface ModuleConfig {
  id: ModuleId;
  label: string;
  short: string;
  description: string;
  /** Calques activés par défaut quand on choisit ce module. */
  defaultLayers: string[];
}

export const MODULES: Record<ModuleId, ModuleConfig> = {
  habitation: {
    id: "habitation",
    label: "Habitation",
    short: "Agents & mandataires",
    description: "Prédictions de vente, carte des ventes DVF, courriers et pige.",
    defaultLayers: ["parcelles", "dvf", "score"],
  },
  marchands: {
    id: "marchands",
    label: "Marchands de biens",
    short: "Divisions & monopropriétés",
    description: "Biens à diviser, immeubles en monopropriété, passoires à rénover, dents creuses.",
    defaultLayers: ["parcelles", "batiments", "dpe", "copros"],
  },
  promoteurs: {
    id: "promoteurs",
    label: "Promoteurs",
    short: "Recherche foncière",
    description: "Terrains en zone U/AU, agrégation de parcelles contiguës, constructibilité indicative.",
    defaultLayers: ["parcelles", "plu", "permis"],
  },
  entreprise: {
    id: "entreprise",
    label: "Immobilier d'entreprise",
    short: "Bureaux, commerces, entrepôts",
    description: "DPE tertiaire, sociétés propriétaires et occupants, valeurs locatives, transactions de locaux.",
    defaultLayers: ["parcelles", "personnes-morales", "dvf"],
  },
};

export const MODULE_LIST = Object.values(MODULES);
