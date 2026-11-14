export interface LayerDef {
  id: string;
  label: string;
  group: "cadastre" | "marche" | "energie" | "urbanisme" | "proprietaires" | "risques" | "prediction";
  /** "live" = disponible partout (API publique), "imported" = départements importés, "planned" = pas encore implémenté. */
  status: "live" | "imported" | "planned";
  legend?: { color: string; label: string }[];
}

export const DPE_COLORS = { A: "#319834", B: "#33cc31", C: "#cbfc34", D: "#fbfe06", E: "#fbcc05", F: "#fc9935", G: "#fc0205" } as const;

/** Calques qui recolorent le remplissage des parcelles : un seul actif à la fois. */
export const PARCEL_COLOR_GROUP = ["dpe", "score", "personnes-morales"];

export const PRIX_BINS = [
  { max: 2500, color: "#2a9d8f", label: "< 2 500 €/m²" },
  { max: 4000, color: "#8ab17d", label: "2 500 – 4 000" },
  { max: 5500, color: "#e9c46a", label: "4 000 – 5 500" },
  { max: 7500, color: "#f4a261", label: "5 500 – 7 500" },
  { max: Infinity, color: "#e63946", label: "> 7 500" },
];
export const ANCIENNETE_BINS = [
  { color: "#e76f51", label: "< 1 an" },
  { color: "#f4a261", label: "1–2 ans" },
  { color: "#e9c46a", label: "2–3 ans" },
  { color: "#8ab17d", label: "3–4 ans" },
  { color: "#2a9d8f", label: "4 ans et +" },
];
export const SCORE_RAMP = [
  { color: "#ffe08a", label: "40" },
  { color: "#f4a261", label: "70" },
  { color: "#c1121f", label: "100" },
];

export const LAYERS: LayerDef[] = [
  { id: "parcelles", label: "Parcelles cadastrales", group: "cadastre", status: "live" },
  { id: "batiments", label: "Bâtiments", group: "cadastre", status: "live" },
  {
    id: "dvf",
    label: "Ventes DVF",
    group: "marche",
    status: "imported",
  },
  {
    id: "dpe",
    label: "DPE (A → G)",
    group: "energie",
    status: "imported",
    legend: Object.entries(DPE_COLORS).map(([k, color]) => ({ color, label: k })),
  },
  {
    id: "plu",
    label: "Zonage PLU (U/AU/A/N)",
    group: "urbanisme",
    status: "imported",
    legend: [
      { color: "#e63946", label: "U" },
      { color: "#f4a261", label: "AU" },
      { color: "#8ab17d", label: "A" },
      { color: "#2a9d8f", label: "N" },
    ],
  },
  { id: "permis", label: "Permis récents (5 ans)", group: "urbanisme", status: "imported", legend: [{ color: "#06d6a0", label: "autorisation d'urbanisme" }] },
  { id: "copros", label: "Copropriétés (RNIC)", group: "proprietaires", status: "imported", legend: [{ color: "#3a86ff", label: "copropriété immatriculée" }] },
  {
    id: "personnes-morales",
    label: "Propriétés de personnes morales",
    group: "proprietaires",
    status: "imported",
    legend: [
      { color: "#7b2cbf", label: "société privée" },
      { color: "#98a2b3", label: "public / HLM" },
    ],
  },
  { id: "risques", label: "Risques (Géorisques)", group: "risques", status: "planned" },
  { id: "score", label: "Probabilité de vente", group: "prediction", status: "imported", legend: SCORE_RAMP },
];

export const LAYER_GROUPS: Record<LayerDef["group"], string> = {
  cadastre: "Cadastre",
  marche: "Marché",
  energie: "Énergie",
  urbanisme: "Urbanisme",
  proprietaires: "Propriétaires",
  risques: "Risques",
  prediction: "Prédiction",
};
