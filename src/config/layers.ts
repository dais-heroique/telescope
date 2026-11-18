export interface LayerDef {
  id: string;
  label: string;
  group: "cadastre" | "marche" | "energie" | "reseaux" | "urbanisme" | "proprietaires" | "risques" | "environnement" | "prediction";
  /** "live" = disponible partout (API publique), "imported" = départements importés, "planned" = pas encore implémenté. */
  status: "live" | "imported" | "planned";
  legend?: { color: string; label: string }[];
  /** Précision affichée sous le calque quand il est actif (zoom minimal, source…). */
  hint?: string;
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
    hint: "Visible à partir du zoom 12. Survolez une zone pour voir son type ; les limites ont la couleur de leur type.",
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
  {
    id: "postes-sources", label: "Postes sources électriques", group: "reseaux", status: "live",
    hint: "Postes du réseau public et capacité d'accueil S3REnR (MW), France métropolitaine hors Corse. Source : RTE / Enedis via IGN.",
  },
  {
    id: "postes-htabt", label: "Postes HTA/BT", group: "reseaux", status: "live",
    legend: [{ color: "#0f766e", label: "poste de distribution" }],
    hint: "Visible à partir du zoom 15. Source : Enedis (Licence Ouverte).",
  },
  {
    id: "reseau-aerien", label: "Réseau électrique aérien", group: "reseaux", status: "live",
    legend: [{ color: "#dc2626", label: "HTA" }, { color: "#f59e0b", label: "BT" }],
    hint: "HTA dès le zoom 15, BT dès le zoom 16. Source : Enedis (Licence Ouverte).",
  },
  {
    id: "reseau-souterrain", label: "Réseau électrique souterrain", group: "reseaux", status: "live",
    legend: [{ color: "#2563eb", label: "HTA" }, { color: "#0ea5e9", label: "BT" }],
    hint: "HTA dès le zoom 15, BT dès le zoom 16 (traits pointillés). Source : Enedis (Licence Ouverte).",
  },
  { id: "risques", label: "Risques (Géorisques)", group: "risques", status: "planned" },
  {
    id: "zones-protegees", label: "Zones protégées", group: "environnement", status: "live",
    hint: "Natura 2000 (habitats, oiseaux), ZNIEFF 1 et 2, parcs nationaux et régionaux, réserves naturelles, arrêtés de biotope. Source : INPN / IGN.",
  },
  {
    id: "zones-humides", label: "Zones humides", group: "environnement", status: "live",
    hint: "Zones humides et eaux permanentes (Copernicus / CORINE), tourbières (BCAE), sites Ramsar. Source : IGN / INPN.",
  },
  { id: "score", label: "Probabilité de vente", group: "prediction", status: "imported", legend: SCORE_RAMP },
];

export const LAYER_GROUPS: Record<LayerDef["group"], string> = {
  cadastre: "Cadastre",
  marche: "Marché",
  energie: "Énergie",
  reseaux: "Réseaux électriques",
  urbanisme: "Urbanisme",
  proprietaires: "Propriétaires",
  risques: "Risques",
  environnement: "Environnement",
  prediction: "Prédiction",
};
