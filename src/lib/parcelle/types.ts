/** Types partagés serveur ↔ client pour la fiche parcelle. */
export interface ParcelBase {
  idu: string;
  mode: "imported" | "live";
  insee: string;
  dep: string;
  section: string;
  numero: string;
  contenance: number | null;
  commune: string | null;
  address: string | null;
  centroid: [number, number]; // [lon, lat]
  geometry: GeoJSON.Geometry | null;
  bbox: [number, number, number, number];
  links: { streetView: string; geoportail: string; googleMaps: string; aerial: string };
}

export interface Building {
  id: string;
  anneeConstruction: number | null;
  nbLogements: number | null;
  nbNiveaux: number | null;
  hauteur: number | null;
  usage: string | null;
  surfaceSol: number | null;
  copro: boolean;
}

export interface Sale {
  id: string;
  date: string;
  nature: string | null;
  valeur: number | null;
  prixM2: number | null;
  type: string | null;
  surfaceBati: number | null;
  surfaceTerrain: number | null;
  pieces: number | null;
  adresse: string | null;
  lon: number | null;
  lat: number | null;
  distance?: number;
}

export interface SalesReport {
  parcel: Sale[];
  comparables: Sale[];
  radius: number;
  stats: { n: number; medianPrixM2: number | null; p25: number | null; p75: number | null };
  byYear: { year: number; n: number; medianPrixM2: number | null }[];
}

export interface DpeEntry {
  numero: string;
  kind: string;
  date: string | null;
  etiquette: string;
  ges: string | null;
  type: string | null;
  surface: number | null;
  conso: number | null;
  adresse: string | null;
  banDate: string | null; // date d'interdiction de location (E/F/G)
  validiteFin: string | null;
}

export interface EnergyReport {
  dpe: DpeEntry[];
  passoire: boolean;
  worst: string | null;
}

export interface UrbanReport {
  zone: { type: string | null; libelle: string | null; libelong: string | null; doc: string | null; url: string | null; partition: string | null } | null;
  prescriptions: { libelle: string; type: string | null }[];
  servitudes: { type: string | null; fichier: string | null }[];
  permis: { id: string; type: string | null; kind: string | null; date: string | null; logements: number | null; demandeur: string | null; distance?: number }[];
  permisProches: { id: string; type: string | null; kind: string | null; date: string | null; logements: number | null; distance: number }[];
  gpuUrl: string;
}

export interface OwnerEntity {
  siren: string;
  denomination: string | null;
  forme: string | null;
  groupe: string | null;
  etat?: string | null;
  creation?: string | null;
  fermeture?: string | null;
  siege?: string | null;
  naf?: string | null;
  dirigeants?: { qualite: string | null; nom: string }[];
  annonces?: { date: string; type: string; famille: string }[];
}

export interface OwnerReport {
  type: "personne_morale" | "particulier" | "inconnu";
  entities: OwnerEntity[];
  copro: { numero: string; nom: string | null; lots: number | null } | null;
  publicOwner: boolean;
  courrier: { destinataire: string; adresse: string };
  note: string;
}

export interface RiskItem {
  label: string;
  level?: string | null;
  detail?: string | null;
}
export interface RiskReport {
  items: RiskItem[];
  icpe: { nom: string; distance?: number | null; regime?: string | null }[];
  source: string;
}

export interface RentReport {
  commune: { insee: string; type: string; loyerM2: number | null; min: number | null; max: number | null; fiabilite: string | null }[];
  vacance: { taux: number | null; vacants: number | null; total: number | null } | null;
  estimate: { surface: number; loyerMensuel: number; loyerAnnuel: number; prix: number | null; rendementBrut: number | null; basis: string } | null;
}

export interface EnvReport {
  available: boolean;
  radius: number;
  categories: { key: string; label: string; count: number; nearest: { name: string | null; distance: number } | null }[];
}

export interface Synthese {
  mode: "imported" | "live";
  facts: { label: string; value: string }[];
  score: { value: number; factors: { label: string; points: number; detail?: string }[] } | null;
  flags: { key: string; label: string }[];
}

export interface Occupant {
  siren: string;
  siret: string;
  name: string;
  adresse: string | null;
  naf: string | null;
  effectif: string | null;
  since: string | null;
  isSiege: boolean;
}
export interface BusinessReport {
  occupants: Occupant[];
  dpeTertiaire: { numero: string; date: string | null; etiquette: string; secteur: string | null; surface: number | null; adresse: string | null }[];
  radius: number;
}
