export interface DataSource {
  name: string;
  provider: string;
  licence: string;
  url: string;
  usage: string;
}

/** Source de vérité de la page publique « Sources et licences ». Détails techniques : docs/sources.md */
export const SOURCES: DataSource[] = [
  { name: "Demandes de valeurs foncières géolocalisées", provider: "DGFiP / Etalab", licence: "Licence Ouverte 2.0", url: "https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees", usage: "Historique des ventes, prix au m²" },
  { name: "Base Adresse Nationale (Géocodage Géoplateforme)", provider: "IGN / ANCT / La Poste", licence: "Licence Ouverte 2.0 (ODbL pour certains extraits OSM)", url: "https://adresse.data.gouv.fr", usage: "Recherche d'adresse, géocodage" },
  { name: "Plan cadastral informatisé / Cadastre Etalab", provider: "DGFiP / Etalab", licence: "Licence Ouverte 2.0", url: "https://cadastre.data.gouv.fr", usage: "Parcelles, bâtiments, sections" },
  { name: "Base de données nationale des bâtiments (BDNB)", provider: "CSTB", licence: "Licence Ouverte 2.0", url: "https://www.data.gouv.fr/datasets/base-de-donnees-nationale-des-batiments", usage: "Année de construction, logements, hauteur, usage" },
  { name: "DPE logements, neufs et tertiaire ; audits énergétiques", provider: "ADEME", licence: "Licence Ouverte 2.0", url: "https://data.ademe.fr", usage: "Étiquettes énergie, passoires thermiques" },
  { name: "Géoportail de l'Urbanisme", provider: "IGN / Ministère de la Transition écologique", licence: "Licence Ouverte 2.0", url: "https://www.geoportail-urbanisme.gouv.fr", usage: "Zonage PLU, prescriptions, servitudes" },
  { name: "Sitadel — autorisations d'urbanisme", provider: "SDES", licence: "Licence Ouverte 2.0", url: "https://www.data.gouv.fr/datasets/liste-des-permis-de-construire-et-autres-autorisations-durbanisme", usage: "Permis de construire, démolir, aménager" },
  { name: "Registre national d'immatriculation des copropriétés", provider: "ANAH", licence: "Licence Ouverte 2.0", url: "https://www.data.gouv.fr/datasets/registre-national-dimmatriculation-des-coproprietes", usage: "Copropriétés, monopropriétés" },
  { name: "Fichiers des parcelles et locaux des personnes morales", provider: "DGFiP", licence: "Licence Ouverte 2.0", url: "https://www.data.gouv.fr/datasets/fichiers-des-locaux-et-des-parcelles-des-personnes-morales-version-unifiee", usage: "Propriétaires personnes morales (SIREN)" },
  { name: "API Recherche d'entreprises", provider: "DINUM / INSEE / DGE", licence: "Licence Ouverte 2.0", url: "https://recherche-entreprises.api.gouv.fr", usage: "Fiche société, siège, établissements" },
  { name: "BODACC", provider: "DILA", licence: "Licence Ouverte 2.0", url: "https://www.bodacc.fr", usage: "Procédures collectives, cessions, radiations" },
  { name: "Carte des loyers", provider: "Ministère de la Transition écologique / ANIL", licence: "Licence Ouverte 2.0", url: "https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025", usage: "Loyers estimés, rendement brut" },
  { name: "RPLS — parc locatif social", provider: "SDES", licence: "Licence Ouverte 2.0", url: "https://www.data.gouv.fr/datasets/donnees-detaillees-au-logement-du-repertoire-des-logements-locatifs-des-bailleurs-sociaux-rpls", usage: "Signalement du parc social" },
  { name: "LOVAC — logements vacants (agrégé communal)", provider: "Ministère de la Transition écologique", licence: "Licence Ouverte 2.0", url: "https://www.data.gouv.fr/datasets/logements-vacants-du-parc-prive-par-commune-departement-region-france-de-2020-a-2026", usage: "Taux de vacance communal" },
  { name: "Géorisques", provider: "Ministère de la Transition écologique / BRGM", licence: "Licence Ouverte 2.0", url: "https://georisques.gouv.fr", usage: "Inondation, argiles, radon, ICPE" },
  { name: "Plan IGN, orthophotographies, parcellaire, isochrones", provider: "IGN — Géoplateforme", licence: "Licence Ouverte 2.0 (© IGN)", url: "https://geoservices.ign.fr", usage: "Fonds de carte, isochrones" },
  { name: "INSEE (Filosofi, recensement, BPE)", provider: "INSEE", licence: "Licence Ouverte 2.0", url: "https://www.insee.fr", usage: "Démographie, revenus, équipements" },
  { name: "OpenStreetMap", provider: "Contributeurs OpenStreetMap", licence: "ODbL — © les contributeurs d'OpenStreetMap", url: "https://www.openstreetmap.org/copyright", usage: "Équipements et transports (optionnel)" },
];
