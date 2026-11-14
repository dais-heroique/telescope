export interface LayerDef {
  id: string;
  label: string;
  group: "cadastre" | "marche" | "energie" | "urbanisme" | "proprietaires" | "risques" | "prediction";
  /** "live" = disponible partout (API publique), "imported" = départements importés, "planned" = pas encore implémenté. */
  status: "live" | "imported" | "planned";
  legend?: { color: string; label: string }[];
}

export const DPE_COLORS = { A: "#319834", B: "#33cc31", C: "#cbfc34", D: "#fbfe06", E: "#fbcc05", F: "#fc9935", G: "#fc0205" } as const;

export const LAYERS: LayerDef[] = [
  { id: "parcelles", label: "Parcelles cadastrales", group: "cadastre", status: "live" },
  { id: "batiments", label: "Bâtiments", group: "cadastre", status: "live" },
  {
    id: "dvf",
    label: "Ventes DVF",
    group: "marche",
    status: "imported",
    legend: [
      { color: "#2a9d8f", label: "< 3 000 €/m²" },
      { color: "#e9c46a", label: "3 000 – 5 000" },
      { color: "#f4a261", label: "5 000 – 7 000" },
      { color: "#e63946", label: "> 7 000" },
    ],
  },
  {
    id: "dpe",
    label: "DPE (A → G)",
    group: "energie",
    status: "imported",
    legend: Object.entries(DPE_COLORS).map(([k, color]) => ({ color, label: k })),
  },
  { id: "plu", label: "Zonage PLU (U/AU/A/N)", group: "urbanisme", status: "imported" },
  { id: "permis", label: "Permis récents", group: "urbanisme", status: "imported" },
  { id: "copros", label: "Copropriétés (RNIC)", group: "proprietaires", status: "imported" },
  { id: "personnes-morales", label: "Propriétés de personnes morales", group: "proprietaires", status: "imported" },
  { id: "risques", label: "Risques (Géorisques)", group: "risques", status: "planned" },
  { id: "score", label: "Probabilité de vente", group: "prediction", status: "imported" },
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
