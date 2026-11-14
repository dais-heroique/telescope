/** Colonnes disponibles pour l'export (CSV/Excel) ; aucune donnée nominative de personne physique. */
export interface ExportColumn {
  key: string;
  label: string;
  /** Colonne SQL de `parcelles` (alias f). */
  sql: string;
  default?: boolean;
}

export const EXPORT_COLUMNS: ExportColumn[] = [
  { key: "idu", label: "Référence cadastrale (IDU)", sql: "f.idu", default: true },
  { key: "adresse", label: "Adresse", sql: "f.adresse", default: true },
  { key: "insee", label: "Code INSEE", sql: "f.insee", default: true },
  { key: "section", label: "Section", sql: "f.section" },
  { key: "numero", label: "Numéro", sql: "f.numero" },
  { key: "contenance", label: "Surface parcelle (m²)", sql: "f.contenance", default: true },
  { key: "usage", label: "Usage", sql: "f.usage_principal", default: true },
  { key: "annee", label: "Année de construction", sql: "f.annee_construction" },
  { key: "logements", label: "Nb logements", sql: "f.nb_logements" },
  { key: "emprise", label: "Emprise bâtie (m²)", sql: "f.emprise_bati" },
  { key: "libre", label: "Surface libre (m²)", sql: "f.surface_libre" },
  { key: "vente_date", label: "Date dernière vente", sql: "f.last_sale_date", default: true },
  { key: "vente_prix", label: "Prix dernière vente (€)", sql: "f.last_sale_price", default: true },
  { key: "vente_m2", label: "Prix/m² dernière vente", sql: "f.last_sale_prix_m2" },
  { key: "detention", label: "Durée de détention (ans)", sql: "f.hold_years" },
  { key: "dpe", label: "DPE", sql: "f.dpe_latest", default: true },
  { key: "passoire", label: "Passoire thermique", sql: "f.is_passoire" },
  { key: "plu", label: "Zone PLU", sql: "f.plu_type" },
  { key: "copro", label: "Copropriété", sql: "f.is_copro" },
  { key: "pm_nom", label: "Propriétaire personne morale", sql: "f.pm_denomination", default: true },
  { key: "pm_siren", label: "SIREN propriétaire", sql: "f.pm_siren" },
  { key: "pm_forme", label: "Forme juridique", sql: "f.pm_forme" },
  { key: "score", label: "Score de vente", sql: "f.score", default: true },
  { key: "divisible", label: "Divisible", sql: "f.is_divisible" },
  { key: "monopropriete", label: "Monopropriété", sql: "f.is_monopropriete" },
  { key: "dent_creuse", label: "Dent creuse", sql: "f.is_dent_creuse" },
  { key: "lon", label: "Longitude", sql: "f.lon" },
  { key: "lat", label: "Latitude", sql: "f.lat" },
];

export const BOOL_KEYS = new Set(["passoire", "copro", "divisible", "monopropriete", "dent_creuse"]);
