# Sources de données — vérification (14/11/2026)

Chaque endpoint ci-dessous a été **appelé en réel** depuis l'environnement de développement le 2026-11-14. Légende :
✅ vérifié (réponse conforme) · ⚠️ partiel / à confirmer · ❌ non joignable lors du test.
Licences : **LO 2.0** = Licence Ouverte Etalab 2.0 (`lov2` dans l'API data.gouv). Les mentions de licence viennent des métadonnées data.gouv.fr / data.ademe.fr ; celles marquées « à confirmer » n'ont pas pu être lues à la source.

Les URLs de ressources `static.data.gouv.fr/resources/...` **changent à chaque publication** : les scripts d'ingestion résolvent l'URL courante via l'API `https://www.data.gouv.fr/api/1/datasets/<slug>/` (voir `scripts/ingest/lib/datagouv.ts`).

---

## 1. Transactions — DVF géolocalisé (Etalab) ✅
| | |
|---|---|
| Dataset | `demandes-de-valeurs-foncieres-geolocalisees` (data.gouv.fr) — DGFiP/Etalab |
| Fichiers par département | `https://files.data.gouv.fr/geo-dvf/latest/csv/{année}/departements/{dep}.csv.gz` (302 → bucket OVH ; testé 2025/74 : 64 622 lignes, 1,7 Mo). Marqué « archive » par data.gouv ; peut disparaître. |
| Fichiers nationaux (pérennes) | `full-{année}.csv.gz` (≈ 110–140 Mo/an, juillet 2021 → juin 2026) + `dvf.csv.gz` (609 Mo). URL via l'API data.gouv. |
| Format | CSV (virgule), 1 ligne par (mutation × parcelle × local). Colonnes : `id_mutation, date_mutation, numero_disposition, nature_mutation, valeur_fonciere, adresse_*, code_postal, code_commune, nom_commune, code_departement, id_parcelle, numero_volume, lotN_numero, lotN_surface_carrez, nombre_lots, code_type_local, type_local, surface_reelle_bati, nombre_pieces_principales, code_nature_culture, nature_culture, surface_terrain, longitude, latitude` |
| Licence | LO 2.0 |
| MAJ | semestrielle (dernière : 2026-10-21, jusqu'à 1er semestre 2026) |
| Mode | importé (dép. activés) ; à la demande via fichier communal `…/communes/{dep}/{insee}.csv` ✅ (200) |
| Stratégie | Ingestion : fichier département ; repli : flux du `full-{année}.csv.gz` filtré sur `code_departement`. |

## 2. DVF+ Cerema ❌/⚠️
`https://apidf-preprod.cerema.fr/dvf_opendata/mutations/` → **timeout puis 503** lors du test (service de pré-production indisponible). Page de présentation `datafoncier.cerema.fr/.../dvfplus-open-data` ✅ (200). **Décision** : non bloquant — geo-dvf contient déjà les champs utiles ; l'API Cerema reste un enrichissement optionnel (`CEREMA_API_TOKEN`), à réévaluer. Aucun code ne dépend d'elle.

## 3. Adresses — BAN via Géoplateforme IGN ✅
- Recherche/autocomplétion : `https://data.geopf.fr/geocodage/search?q=…&limit=…&autocomplete=1` (+ `index=address`) → GeoJSON (`label`, `citycode`, `banId`, `type` = housenumber/street/municipality…). CORS ouvert. Utilisé par `/api/geocode`.
- Alternative historique : `https://api-adresse.data.gouv.fr/search/` ✅ (200).
- Géocodage inverse : `https://data.geopf.fr/geocodage/reverse` (même service).
- Licence : BAN sous Licence Ouverte 2.0 (à confirmer sur la page BAN avant mise en production ; les extraits ODbL liés à OSM sont à créditer si utilisés).

## 4. Cadastre ✅
- **Cadastre Etalab** : `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements/74/cadastre-74-parcelles.json.gz` (302 → 200, **237 Mo** pour la Haute-Savoie) et `…/communes/{dep}/{insee}/cadastre-{insee}-{parcelles|batiments|sections|…}.json.gz` (bâtiments Annecy : 1,6 Mo). Format GeoJSON (FeatureCollection, WGS84), `properties.id` = IDU, `contenance`, `commune`, `prefixe`, `section`, `numero`.
- **API Carto — module cadastre** : `https://apicarto.ign.fr/api/cadastre/parcelle?code_insee=74010&section=DN&numero=0055&com_abs=000` ✅ (GeoJSON ; `properties.idu`, `contenance`). Utilisé pour la recherche « 74010 000 DN 0055 ».
- **Tuiles vectorielles du parcellaire (PCI)** : `https://data.geopf.fr/tms/1.0.0/PCI/{z}/{x}/{y}.pbf` ✅ (metadata : `…/PCI/metadata.json`, z5–19). Couches : `parcelle` (props `idu, section, numero, contenance, code_insee, nom_com, code_dep…`), `batiment`, `feuille`, `commune`, `localisant`, `departement`, `arrondissement`, `borne_limite_propriete`. XYZ standard (pas de TMS inversé).
- Licence : LO 2.0 (Plan Cadastral Informatisé, DGFiP — dataset `plan-cadastral-informatise`, trimestriel).

## 5. Bâtiments — BDNB (CSTB) ✅
- Dataset `base-de-donnees-nationale-des-batiments` — LO 2.0 — semestriel (millésime **2026-02-b**).
- **Export par département** (CSV zippé) : `https://open-data.s3.fr-par.scw.cloud/bdnb_millesime_2026-02-b/millesime_2026-02-b_dep74/open_data_millesime_2026-02-b_dep74_csv.zip` ✅ (**567 Mo**, 8,8 Mo/s). Modèle : `millesime_<AAAA-MM-x>_dep<NN>/open_data_<millesime>_dep<NN>_csv.zip` — **le millésime change** ; l'URL courante est lue via l'API data.gouv (ressource « Export france – csv ») pour en déduire le motif département.
- Tables utilisées (`csv/…`, séparateur `;`) : `batiment_groupe` (géométrie WKT **Lambert-93 EPSG:2154**, `s_geom_groupe`, `code_commune_insee`, 361 854 groupes en 74), `rel_batiment_groupe_parcelle` (`parcelle_id` = IDU, `parcelle_principale`), `batiment_groupe_ffo_bat` (`annee_construction`, `nb_log`, `nb_niveau`, `usage_niveau_1_txt`), `batiment_groupe_bdtopo_bat` (`hauteur_mean`, `max_hauteur` — BD TOPO), `batiment_groupe_synthese_propriete_usage` (`usage_principal_bdnb_open`), `batiment_groupe_rnc` (rattachement RNIC : `numero_immat_principal`, `nb_lot_tot`, `nb_log`), `batiment_groupe_dpe_representatif_logement`, `batiment_groupe_dvf_open_statistique`.
- API (à la demande) : `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?code_departement_insee=eq.74&limit=1` ✅ (PostgREST, sans clé, géométrie GeoJSON EPSG:2154). Portail : `api-portail.bdnb.io`.
- **BD TOPO** : couvert **via la BDNB** (hauteur/emprise `bdtopo_bat`). Accès direct WFS Géoplateforme non nécessaire en v1.

## 6. Énergie — ADEME ✅
API Data-Fair `https://data.ademe.fr/data-fair/api/v1/datasets/{id}/lines` (LO 2.0, MAJ quasi quotidienne) :
| Jeu | id | lignes (14/11/2026) |
|---|---|---|
| DPE logements existants (depuis 07/2021) | `dpe03existant` | 16 003 705 (dép. 74 : **205 401**) |
| DPE logements neufs (depuis 07/2021) | `dpe02neuf` | 1 469 939 |
| DPE tertiaire (depuis 07/2021) | `j9ol0fwjqckyf49vr29nknbu` | 585 133 |
| DPE tertiaire (avant 07/2021) | `dpe-tertiaire` | 515 562 (figé 2022) |
| Audits énergétiques logements | `audit-opendata` | 3 452 220 |
- Filtre département : `qs=code_departement_ban:74` ; pagination par `after` (curseur) ; `select=` pour limiter les colonnes ; export CSV possible (`format=csv`).
- Champs clés DPE existant : `numero_dpe, date_etablissement_dpe, etiquette_dpe, etiquette_ges, type_batiment, periode_construction, surface_habitable_logement, adresse_ban, identifiant_ban` (clé d'interopérabilité BAN), `code_insee_ban, coordonnee_cartographique_x_ban/y_ban` (Lambert-93), `_geopoint` (« lat,lon »), `conso_5_usages_par_m2_ep`.

## 7. Urbanisme — Géoportail de l'Urbanisme ✅
- **API Carto GPU** : `https://apicarto.ign.fr/api/gpu/zone-urba?geom={GeoJSON}` ✅ (zonage PLU/PLUi à un point ; aussi `prescription-surf|lin|pct`, `info-surf…`, `document`, `secteur-cc`).
- **WFS Géoplateforme** (bulk, 5,4 Mo de capabilities) : `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=wfs_du:zone_urba&OUTPUTFORMAT=application/json&CQL_FILTER=…` ✅ (testé avec `partition='DU_200066793'`). Couches : `wfs_du:zone_urba`, `prescription_*`, `info_*`, `habillage_*`, `doc_urba`, `document`, `municipality`. Pour l'import d'un département : filtrer par emprise (`BBOX`) ou par `partition`.
- Licence : LO 2.0 (données des collectivités diffusées via le GPU).
- Attributs : `typezone` (U, AUc, AUs, A, N), `libelle`, `libelong`, `urlfic` (règlement), `partition`, `datappro`.

## 8. Permis — Sitadel (SDES) ✅
- Dataset `liste-des-permis-de-construire-et-autres-autorisations-durbanisme` (SDES, **LO 2.0**, mensuel, couverture 2013 → 09/2026).
- API DiDo : `https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles/{rid}/csv?DEP_CODE=eq:74&columns=…` ✅ (CSV `;`, pas de `limit` ; 35 272 lignes pour le 74 en 5,7 s).
  - Logements : `8b35affb-55fc-4c1f-915b-7750f974446a` · Locaux non résidentiels : `f8f0700f-806c-40a7-83b1-f21cf507e7c4` · Permis de démolir : `1a9a2f0c-56fe-4e69-84a7-fbbda2121f02` · Permis d'aménager : `96883f50-538b-41f9-a059-c6eb97e6a23a`.
- Colonnes utiles : `NUM_DAU, TYPE_DAU (PC/DP/PA/PD), ETAT_DAU, DATE_REELLE_AUTORISATION, COMM, ADR_*_TER, SEC_CADASTRE1..16 / NUM_CADASTRE1..16` (**référence cadastrale** → IDU = `COMM` + `000` + section(2) + numéro(4)), `SIREN_DEM, DENOM_DEM` (demandeur personne morale), `NB_LGT_TOT_CREES, SURF_HAB_CREEE`.
- Limite : le préfixe de section (`com_abs`) n'est pas fourni → on suppose `000` (cas général ; ~1 % de communes fusionnées concernées).

## 9. Copropriétés — RNIC (ANAH) ✅
- Dataset `registre-national-dimmatriculation-des-coproprietes` — **LO 2.0** — quotidien. Ressource « RNIC – Actualisation quotidienne » (≈ 412 Mo, CSV `,`), URL changeante (via API data.gouv). Dictionnaire : `rnic-dictionnaire-donnees.csv`.
- Colonnes utiles : `numero_immatriculation, nom_usage_copropriete, adresse_reference, longitude, latitude, nombre_total_lots, nombre_lots_habitation, periode_construction, reference_cadastrale_1..3, code_insee_parcelle_N, prefixe_parcelle_N, section_parcelle_N, numero_parcelle_N, nombre_parcelles, code_officiel_commune`.
- Rattachement aux bâtiments aussi dispo via BDNB (`batiment_groupe_rnc`).

## 10. Propriétaires personnes morales — DGFiP ✅
- Dataset « version unifiée » `fichiers-des-locaux-et-des-parcelles-des-personnes-morales-version-unifiee` (**LO 2.0**, annuel, millésime 2024 ; fichiers **Parquet**) :
  `parcelles-personnes-morales-latest.parquet` (376 Mo), `locaux-personnes-morales-latest.parquet` (208 Mo), + `…-{2019…2024}.parquet`, documentation `documentation-champs-*.parquet`. URL via API data.gouv.
- Lecture en Node par **range requests Parquet** (`hyparquet`) pour ne lire que les colonnes/groupes utiles puis filtrer le département.
- ⚠️ Ces fichiers ne couvrent que les **personnes morales** (SIREN, dénomination, forme juridique) ; **aucune donnée sur les personnes physiques**, conformément au RGPD.

## 11. Entreprises ✅
- **API Recherche d'entreprises** : `https://recherche-entreprises.api.gouv.fr/search?q={siren|nom}` ✅ (sans clé) et `/near_point?lat=&long=&radius=` ✅ (établissements autour d'un point → occupants en immobilier d'entreprise). Réponse : `siren, nom_complet, nature_juridique, etat_administratif, siege{adresse, code_postal, commune…}, dirigeants[], date_creation, date_fermeture, finances…`. LO 2.0. Limite : ~7 req/s.
- **BODACC** (DILA, opendatasoft) : `https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records?where=…&limit=…` ✅ (723 202 annonces pour la Haute-Savoie). Filtrer par `registre` (SIREN). Familles : création, vente/cession, procédures collectives, radiation, dépôt des comptes. LO 2.0 (à confirmer sur le dataset).
- **SIRENE (INSEE)** : stock bulk `base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret` (data.gouv, LO 2.0) ; l'API INSEE (`api.insee.fr`) exige une clé → **non utilisée** ; on passe par Recherche d'entreprises.
- RGPD : les « dirigeants » sont des informations légales publiques du RNE, **affichées à la demande uniquement** dans la fiche d'une société propriétaire, **jamais stockées en base ni exportées en masse** (cf. `docs/decisions.md`).

## 12. Loyers ✅
- « Carte des loyers » (Ministère de la Transition écologique / ANIL) — indicateurs de loyers d'annonce par commune, éditions 2022–2025 (dataset `carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025`, **LO 2.0**, MAJ 2026-09-14). CSV `;` à virgule décimale : `pred-app-mef-dhup.csv` (appartement), `pred-app12…` (T1–T2), `pred-app3…` (T3+), `pred-mai-mef-dhup.csv` (maison). Colonnes : `INSEE_C, LIBGEO, EPCI, DEP, loypredm2` (€/m² charges comprises), `lwr.IPm2`, `upr.IPm2` (intervalle de prédiction), `TYPPRED` (commune/maille), `nbobs_com`, `R2_adj`. ⚠️ Encodage Latin-1/Windows-1252.
- Observatoires locaux des loyers (OLAP) : pas d'API nationale ouverte unifiée → **hors v1**, à brancher par agglomération.

## 13. Logement social — RPLS (SDES) ✅
Dataset « Données détaillées au logement du RPLS » (**LO 2.0**, annuel, MAJ 2026-01-20), DiDo `f3c2f2cb-8fb1-40fd-8733-964247744c9a/csv?DEP_CODE=eq:74` (même mécanique que Sitadel ; colonnes à vérifier à l'import). Sert à signaler le parc social (exclusion/avertissement). Le fichier est localisé à la commune/adresse, pas à la parcelle → rapprochement par adresse BAN/commune.

## 14. Vacance — LOVAC ✅ (agrégé)
Dataset « Logements vacants du parc privé par commune, département, région, France, de 2020 à 2026 » (Ministère de la Transition écologique, **LO 2.0**, MAJ 2026-06-25) : `lovac-opendata-communes26.csv` (8 Mo). **Données communales agrégées uniquement** (le fichier nominatif/parcellaire LOVAC est réservé aux collectivités via Zéro Logement Vacant). Le signal « vacance » parcellaire n'est donc **pas disponible en open data** ; VIGIE utilise le **taux de vacance communal** comme facteur de contexte du score.

## 15. Démographie — INSEE ⚠️
- Site `insee.fr` joignable (200). Fichiers Filosofi (revenus, communes/IRIS), recensement (logements, statut d'occupation) et BPE à intégrer via les pages « Séries/Fichiers détail » de l'INSEE ; **URLs exactes de téléchargement à fixer au moment de l'étape 10** (non inventées ici). Licence INSEE : Licence Ouverte 2.0 pour les produits diffusés sur insee.fr (à confirmer par fichier).
- Alternative opérationnelle : API « Données locales » (INSEE, clé requise) → non retenue par défaut.

## 16. Risques — Géorisques ✅
API `https://georisques.gouv.fr/api/v1/…` (sans clé, LO 2.0) : `gaspar/risques?code_insee=` ✅ (risques par commune), `gaspar/azi?latlon=&rayon=` ✅ (zones inondables), `rga?latlon=lon,lat` ✅ (retrait-gonflement des argiles : `codeExposition`), `radon?code_insee=` ✅, `zonage_sismique?code_insee=` ✅, `installations_classees?latlon=&rayon=` ✅ (ICPE, paginé), `mvt?latlon=&rayon=` ✅ (mouvements de terrain). ⚠️ `/sis` → 404 : l'endpoint « sites et sols pollués » porte un autre nom (`ssp`/`sis` à chercher dans le swagger avant usage).
- Note : le paramètre `latlon` est au format `lon,lat`.

## 17. Équipements — BPE INSEE / OSM ⚠️/❌
- **BPE INSEE** : à intégrer depuis insee.fr (voir §15, URL à fixer).
- **OSM Overpass** (`overpass-api.de`, `overpass.kumi.systems`, `overpass.private.coffee`) : **❌ non joignable depuis le sandbox** (reset/timeout) — probable restriction réseau de l'environnement de dev, pas un défaut du service. Le code utilisera `OVERPASS_URL` configurable avec timeout court et dégradation propre (section « Environnement » masquée si échec). Licence **ODbL** (© contributeurs OpenStreetMap) : attribution obligatoire si affiché.

## 18. Isochrones — IGN ✅
`https://data.geopf.fr/navigation/isochrone?point=lon,lat&resource=bdtopo-valhalla&costValue=600&costType=time&profile=pedestrian|car&direction=departure&geometryFormat=geojson` ✅ (réponse : `geometry` GeoJSON Polygon). Ressource `bdtopo-valhalla`.

## 19. Fonds de carte — IGN Géoplateforme ✅
- **Plan IGN v2** (raster WMTS) : `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}` ✅ (`TILEROW` = y XYZ ; Web Mercator).
- **Orthophotos** : même URL, `LAYER=ORTHOIMAGERY.ORTHOPHOTOS`, `FORMAT=image/jpeg` ✅.
- **Plan IGN vectoriel** : tuiles `https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf` ✅ + style `https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json` ✅ (non utilisé en v1 : raster plus léger).
- **Parcellaire express** (raster) : `LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS` ✅ ; `CADASTRALPARCELS.PARCELS` listé dans les capabilities.
- Licence : Etalab 2.0 pour les services publics de la Géoplateforme (mention « © IGN »). Capabilities : `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities`.
- ⚠️ `https://data.geopf.fr/` (racine) renvoie 404 : normal, seuls les services sont exposés.

## 20. Annonces (pige) — optionnel
Aucun open data. Interface `ListingsProvider` (`moteurimmo` | `streamestate`) ; clé API payante via variable d'env ; module masqué sans clé. **Aucun scraping** (Leboncoin, SeLoger…).

---

## Synthèse d'ingestion pour le département 74
| Jeu | Volume (74) | Taille source | Méthode |
|---|---|---|---|
| Cadastre parcelles | ≈ 700 k parcelles | 237 Mo (.json.gz) | stream JSON |
| Cadastre bâtiments | ≈ 360 k | par commune | stream JSON |
| DVF (2021-S2 → 2026-S1) | ≈ 300 k lignes | 5 × ≈ 1,7 Mo + semestre | CSV |
| BDNB | 361 854 groupes | 567 Mo (zip) | CSV (`unzip -p`) |
| DPE existant | 205 401 | API (pages) | API `qs=code_departement_ban:74` |
| PLU zones | ≈ 5 k zones | WFS | GeoJSON par bbox |
| Sitadel | 35 272 | 3,4 Mo | CSV `;` |
| RNIC | ≈ 20 k copros (74) | 412 Mo (national) | CSV stream filtré |
| Personnes morales | ≈ 30 k parcelles (74) | 376 Mo (Parquet) | range-requests |
