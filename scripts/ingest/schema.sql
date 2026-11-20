-- Schéma PostGIS du moteur d'ingestion (hors ligne). L'application web ne lit PAS ce Postgres :
-- les données sont exportées vers libSQL/Turso par scripts/export/to-libsql.ts.
create extension if not exists postgis;

-- ───────────── Suivi des imports (page admin) ─────────────
create table public.ingest_runs (
  id           bigserial primary key,
  dataset      text not null,
  dep          text not null,
  source_ref   text,                      -- millésime / URL / date de la source
  status       text not null default 'running' check (status in ('running','ok','error')),
  rows_in      bigint,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index ingest_runs_dataset_idx on public.ingest_runs(dataset, dep, started_at desc);

-- ───────────── Cadastre ─────────────
create table public.parcelles (
  idu         text primary key,           -- 14 car. : INSEE(5) + préfixe(3) + section(2) + numéro(4)
  dep         text not null,
  insee       text not null,
  prefixe     text not null default '000',
  section     text not null,
  numero      text not null,
  contenance  integer,                    -- m², donnée cadastrale
  geom        geometry(MultiPolygon, 4326) not null,
  geom_3857   geometry(MultiPolygon, 3857) generated always as (st_transform(geom, 3857)) stored,
  pt          geometry(Point, 4326) generated always as (st_pointonsurface(geom)) stored
);
create index parcelles_geom_3857_gist on public.parcelles using gist (geom_3857);
create index parcelles_pt_gist on public.parcelles using gist (pt);
create index parcelles_dep_idx on public.parcelles (dep);
create index parcelles_insee_idx on public.parcelles (insee);

-- ───────────── Bâtiments (BDNB : groupes de bâtiments) ─────────────
create table public.batiments (
  bg_id             text primary key,     -- batiment_groupe_id BDNB
  dep               text not null,
  insee             text not null,
  geom              geometry(MultiPolygon, 4326) not null,
  geom_3857         geometry(MultiPolygon, 3857) generated always as (st_transform(geom, 3857)) stored,
  surface_sol       numeric,              -- emprise au sol (m²)
  annee_construction integer,
  nb_log            integer,
  nb_niveau         integer,
  usage_principal   text,
  hauteur_mean      numeric,
  hauteur_max       numeric,
  rnic_numero       text,                 -- numéro d'immatriculation RNIC si en copropriété
  rnic_nb_lots      integer
);
create index batiments_geom_3857_gist on public.batiments using gist (geom_3857);
create index batiments_dep_idx on public.batiments (dep);

-- ───────────── Bâtiments du cadastre (Etalab) : plus complets que la BDNB, servent à savoir si une parcelle est bâtie ─────────────
create table public.cad_batiments (
  id         bigserial primary key,
  dep        text not null,
  type       text,                        -- 01 = bâti dur, 02 = bâti léger
  geom       geometry(MultiPolygon, 4326) not null,
  geom_3857  geometry(MultiPolygon, 3857) generated always as (st_transform(geom, 3857)) stored
);
create index cad_batiments_geom_3857_gist on public.cad_batiments using gist (geom_3857);
create index cad_batiments_dep_idx on public.cad_batiments (dep);

create table public.bat_parcelle (
  bg_id      text not null,
  idu        text not null,
  principale boolean not null default false,
  dep        text not null,
  primary key (bg_id, idu)
);
create index bat_parcelle_idu_idx on public.bat_parcelle (idu);

-- ───────────── Transactions DVF ─────────────
create table public.dvf_mutations (
  id_mutation      text primary key,
  dep              text not null,
  insee            text not null,
  date_mutation    date not null,
  nature           text,
  valeur_fonciere  numeric,
  adresse          text,
  surface_bati_res numeric,               -- m² bâtis maisons+appartements
  surface_bati_tot numeric,
  surface_terrain  numeric,
  nb_lots          integer,
  nb_parcelles     integer,
  types_locaux     text[],                -- ex. {Maison,Dépendance}
  type_principal   text,                  -- Maison | Appartement | Local industriel. commercial ou assimilé | Terrain | Autre
  nb_pieces        integer,
  prix_m2          numeric,               -- valeur / surface_bati_res (si logement unique non ambigu)
  geom             geometry(Point, 4326)
);
create index dvf_mutations_geom_gist on public.dvf_mutations using gist (geom);
create index dvf_mutations_date_idx on public.dvf_mutations (date_mutation);
create index dvf_mutations_dep_idx on public.dvf_mutations (dep, type_principal);

create table public.dvf_mutation_parcelles (
  id_mutation text not null,
  idu         text not null,
  dep         text not null,
  primary key (id_mutation, idu)
);
create index dvf_mp_idu_idx on public.dvf_mutation_parcelles (idu);

-- ───────────── DPE (ADEME) ─────────────
create table public.dpe (
  numero_dpe      text primary key,
  kind            text not null check (kind in ('existant','neuf','tertiaire')),
  dep             text not null,
  insee           text,
  date_dpe        date,
  etiquette_dpe   char(1),
  etiquette_ges   char(1),
  type_batiment   text,                   -- maison / appartement / immeuble ; secteur d'activité pour le tertiaire
  annee_construction integer,
  periode_construction text,
  surface         numeric,
  conso_m2_ep     numeric,                -- kWh EP/m²/an
  adresse         text,
  id_ban          text,
  geom            geometry(Point, 4326),
  idu             text                    -- parcelle (jointure spatiale)
);
create index dpe_geom_gist on public.dpe using gist (geom);
create index dpe_idu_idx on public.dpe (idu);
create index dpe_dep_idx on public.dpe (dep, kind);

-- ───────────── Urbanisme (GPU) ─────────────
create table public.plu_zones (
  gid        text primary key,            -- identifiant WFS (zone_urba.NNN)
  dep        text not null,
  partition  text,
  typezone   text,                        -- U, AUc, AUs, A, N…
  libelle    text,
  libelong   text,
  urlfic     text,
  datappro   date,
  geom       geometry(MultiPolygon, 4326) not null,
  geom_3857  geometry(MultiPolygon, 3857) generated always as (st_transform(geom, 3857)) stored
);
create index plu_zones_geom_3857_gist on public.plu_zones using gist (geom_3857);
create index plu_zones_geom_gist on public.plu_zones using gist (geom);

-- ───────────── Permis (Sitadel) ─────────────
create table public.permis (
  num_dau       text primary key,
  dep           text not null,
  insee         text not null,
  type_dau      text,                     -- PC, DP, PA, PD
  etat_dau      integer,
  date_autorisation date,
  adresse       text,
  siren_dem     text,
  denom_dem     text,
  nb_logements  integer,
  surf_habitable numeric,
  kind          text not null default 'logement' check (kind in ('logement','local','demolir','amenager'))
);
create index permis_date_idx on public.permis (date_autorisation);
create index permis_dep_idx on public.permis (dep);

create table public.permis_parcelles (
  num_dau text not null,
  idu     text not null,
  dep     text not null,
  primary key (num_dau, idu)
);
create index permis_parcelles_idu_idx on public.permis_parcelles (idu);

-- ───────────── Copropriétés (RNIC) ─────────────
create table public.rnic_copros (
  numero        text primary key,
  dep           text not null,
  insee         text,
  nom           text,
  adresse       text,
  nb_lots       integer,
  nb_lots_hab   integer,
  periode_construction text,
  syndic_type   text,
  geom          geometry(Point, 4326)
);
create index rnic_copros_geom_gist on public.rnic_copros using gist (geom);

create table public.rnic_parcelles (
  numero text not null,
  idu    text not null,
  dep    text not null,
  primary key (numero, idu)
);
create index rnic_parcelles_idu_idx on public.rnic_parcelles (idu);

-- ───────────── Propriétaires personnes morales (DGFiP) ─────────────
create table public.pm_parcelles (
  idu           text not null,
  siren         text not null,
  dep           text not null,
  denomination  text,
  forme_juridique text,
  groupe_personne text,                   -- commune, État, SCI/société, HLM…
  millesime     integer,
  primary key (idu, siren)
);
create index pm_parcelles_siren_idx on public.pm_parcelles (siren);
create index pm_parcelles_dep_idx on public.pm_parcelles (dep);

-- ───────────── Contexte communal ─────────────
create table public.loyers_communes (
  insee       text not null,
  type_bien   text not null check (type_bien in ('appartement','appartement_t1_t2','appartement_t3_plus','maison')),
  loyer_m2    numeric,                    -- €/m² charges comprises
  loyer_m2_min numeric,
  loyer_m2_max numeric,
  fiabilite   text,                       -- commune / maille
  annee       integer not null,
  primary key (insee, type_bien, annee)
);

create table public.vacance_communes (
  insee        text primary key,
  annee        integer not null,
  logements_total integer,
  logements_vacants integer,
  taux_vacance numeric
);

-- ───────────── Table de features par parcelle (calculée par scripts/ingest/features.ts) ─────────────
create table public.parcel_features (
  idu              text primary key references public.parcelles(idu) on delete cascade,
  dep              text not null,
  insee            text not null,
  contenance       integer,
  -- bâti
  nb_batiments     integer not null default 0,
  emprise_bati     numeric,
  surface_libre    numeric,
  annee_construction integer,
  nb_logements     integer,
  nb_niveaux       integer,
  hauteur_max      numeric,
  usage_principal  text,
  adresse          text,
  -- copropriété / propriété
  is_copro         boolean not null default false,
  copro_numero     text,
  copro_nb_lots    integer,
  is_pm            boolean not null default false,
  pm_count         integer not null default 0,
  lot_libre_m2     numeric,              -- divisible : surface du plus grand lot détachable estimé (m²)
  pm_siren         text,
  pm_denomination  text,
  pm_forme         text,
  pm_groupe        text,
  -- ventes
  nb_ventes        integer not null default 0,
  last_sale_date   date,
  last_sale_price  numeric,
  last_sale_prix_m2 numeric,
  last_sale_type   text,
  hold_years       numeric,
  -- énergie
  nb_dpe           integer not null default 0,
  dpe_latest       char(1),
  dpe_latest_date  date,
  dpe_worst        char(1),
  is_passoire      boolean not null default false,
  dpe_conso_m2     numeric,
  -- urbanisme
  plu_type         text,
  plu_libelle      text,
  nb_permis_5y     integer not null default 0,
  last_permis_date date,
  nb_permis_proches integer not null default 0,   -- autour (≈ 200 m, 3 ans)
  -- score & détections (étape 7)
  score            smallint,
  score_factors    jsonb,
  is_divisible     boolean not null default false,
  is_monopropriete boolean not null default false,
  is_dent_creuse   boolean not null default false,
  computed_at      timestamptz not null default now()
);
create index parcel_features_dep_idx on public.parcel_features (dep);
create index parcel_features_score_idx on public.parcel_features (dep, score desc);
create index parcel_features_dpe_idx on public.parcel_features (dep, dpe_latest);
create index parcel_features_plu_idx on public.parcel_features (dep, plu_type);
create index parcel_features_pm_idx on public.parcel_features (dep) where is_pm;
create index parcel_features_flags_idx on public.parcel_features (dep) where is_divisible or is_monopropriete or is_dent_creuse or is_passoire;
create index parcel_features_sale_idx on public.parcel_features (dep, last_sale_date);


-- ───────────── Statistiques communales (contexte du score) ─────────────
create table if not exists public.commune_stats (
  insee           text primary key,
  dep             text not null,
  cycle_years     numeric,     -- médiane des intervalles entre deux ventes d'une même parcelle
  turnover_pct    numeric,     -- % de parcelles bâties vendues sur 12 mois
  prix_m2_median  numeric,     -- médiane €/m² logements, 24 derniers mois
  vacance_pct     numeric
);
