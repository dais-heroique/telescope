/** Schéma libSQL des données importées. Créé et alimenté par scripts/export/to-libsql.ts. */
const FEATURE_COLS = `
  nb_batiments integer, emprise_bati real, surface_libre real, annee_construction integer, nb_logements integer, nb_niveaux integer,
  hauteur_max real, usage_principal text, is_copro integer, copro_numero text, copro_nb_lots integer,
  is_pm integer, pm_count integer, pm_siren text, pm_denomination text, pm_forme text, pm_groupe text,
  nb_ventes integer, last_sale_date text, last_sale_price real, last_sale_prix_m2 real, last_sale_type text, hold_years real,
  nb_dpe integer, dpe_latest text, dpe_latest_date text, dpe_worst text, is_passoire integer, dpe_conso_m2 real,
  plu_type text, plu_libelle text, nb_permis_5y integer, last_permis_date text, nb_permis_proches integer,
  score integer, score_factors text, is_divisible integer, is_monopropriete integer, is_dent_creuse integer`;

export const FEATURE_COLUMNS = FEATURE_COLS.split(",").map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);

export const DATA_TABLES = `
create table if not exists parcelles (
  idu text primary key, dep text not null, insee text not null, section text, numero text, contenance integer,
  lon real, lat real, tx integer, ty integer, geom blob not null,${FEATURE_COLS}
);
create table if not exists idx_parcelles (z integer not null, tx integer not null, ty integer not null, id text not null, primary key (z, tx, ty, id)) without rowid;

create table if not exists batiments (
  bg_id text primary key, dep text not null, insee text, geom blob not null, surface_sol real, annee_construction integer, nb_log integer,
  nb_niveau integer, usage_principal text, hauteur_mean real, hauteur_max real, rnic_numero text, rnic_nb_lots integer
);
create table if not exists idx_batiments (z integer not null, tx integer not null, ty integer not null, id text not null, primary key (z, tx, ty, id)) without rowid;
create table if not exists bat_parcelle (bg_id text not null, idu text not null, principale integer, dep text not null, primary key (bg_id, idu));

create table if not exists dvf_mutations (
  id_mutation text primary key, dep text not null, insee text, date_mutation text not null, nature text, valeur_fonciere real, adresse text,
  surface_bati_res real, surface_bati_tot real, surface_terrain real, nb_lots integer, nb_parcelles integer, type_principal text, nb_pieces integer,
  prix_m2 real, lon real, lat real, tx integer, ty integer
);
create table if not exists dvf_mutation_parcelles (id_mutation text not null, idu text not null, dep text not null, primary key (id_mutation, idu));

create table if not exists dpe (
  numero_dpe text primary key, kind text, dep text not null, insee text, date_dpe text, etiquette_dpe text, etiquette_ges text, type_batiment text,
  annee_construction integer, periode_construction text, surface real, conso_m2_ep real, adresse text, id_ban text, lon real, lat real, idu text
);

create table if not exists plu_zones (
  gid text primary key, dep text not null, partition text, typezone text, libelle text, libelong text, urlfic text, datappro text, geom blob not null
);
create table if not exists idx_plu_zones (z integer not null, tx integer not null, ty integer not null, id text not null, primary key (z, tx, ty, id)) without rowid;

create table if not exists permis (
  num_dau text primary key, dep text not null, insee text, type_dau text, etat_dau integer, date_autorisation text, adresse text, siren_dem text,
  denom_dem text, nb_logements integer, surf_habitable real, kind text, lon real, lat real, tx integer, ty integer
);
create table if not exists permis_parcelles (num_dau text not null, idu text not null, dep text not null, primary key (num_dau, idu));

create table if not exists rnic_copros (
  numero text primary key, dep text not null, insee text, nom text, adresse text, nb_lots integer, nb_lots_hab integer, periode_construction text,
  syndic_type text, lon real, lat real, tx integer, ty integer
);
create table if not exists rnic_parcelles (numero text not null, idu text not null, dep text not null, primary key (numero, idu));

create table if not exists pm_parcelles (idu text not null, siren text not null, dep text not null, denomination text, forme_juridique text, groupe_personne text, millesime integer, primary key (idu, siren));

create table if not exists loyers_communes (insee text not null, type_bien text not null, loyer_m2 real, loyer_m2_min real, loyer_m2_max real, fiabilite text, annee integer not null, primary key (insee, type_bien, annee));
create table if not exists vacance_communes (insee text primary key, annee integer, logements_total integer, logements_vacants integer, taux_vacance real);
`;

/** Index secondaires, créés APRÈS le chargement (beaucoup plus rapide). */
export const DATA_INDEXES = `
create index if not exists parcelles_dep_score on parcelles (dep, score desc);
create index if not exists parcelles_tile on parcelles (tx, ty, score);
create index if not exists parcelles_pm on parcelles (dep) where is_pm = 1;
create index if not exists parcelles_flags on parcelles (dep) where is_divisible = 1 or is_monopropriete = 1 or is_dent_creuse = 1 or is_passoire = 1;
create index if not exists parcelles_insee on parcelles (insee);
create index if not exists bat_parcelle_idu on bat_parcelle (idu);
create index if not exists dvf_tile on dvf_mutations (tx, ty);
create index if not exists dvf_insee_date on dvf_mutations (insee, date_mutation);
create index if not exists dvf_mp_idu on dvf_mutation_parcelles (idu);
create index if not exists dpe_idu on dpe (idu);
create index if not exists permis_tile on permis (tx, ty);
create index if not exists permis_parcelles_idu on permis_parcelles (idu);
create index if not exists rnic_tile on rnic_copros (tx, ty);
create index if not exists rnic_parcelles_idu on rnic_parcelles (idu);
create index if not exists pm_siren on pm_parcelles (siren);
create index if not exists pm_idu on pm_parcelles (idu);
`;

export const LEVELS = { parcelles: [16, 14, 12, 10], batiments: [16, 14], plu_zones: [12, 10, 8, 6] } as const;
export const POINT_LEVEL = 12;
