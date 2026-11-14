# Décisions d'architecture (VIGIE)

Format : date · décision · raison. Quand une décision est ambiguë, on prend l'option la plus simple qui marche.

## Étape 1 — scaffold
- **Branche de travail** : `claude/vigie-platform-setup-x0gg0z` (imposée par l'environnement) au lieu de `main` ; la fusion vers `main` se fait par PR à la demande.
- **MapLibre GL v5 (et non v6)** : la v6 charge son worker en module ES via `import.meta.url`, ce qui casse avec le bundling webpack de Next 15 (« Worker failed to load »). La v5 inline son worker. À réévaluer quand Next/Turbopack le gérera.
- **Wrapper de carte** : MapLibre impose `position: relative` sur son conteneur (CSS non « layered », prioritaire sur Tailwind) → la carte vit dans un `div` interne `h-full w-full`, enveloppé par un `div absolute inset-0`.
- **Fonds IGN en raster WMTS** (Plan IGN v2, ortho) + **tuiles vectorielles PCI** (parcellaire) : fonctionnent sans clé, sur toute la France. Le style vectoriel complet « PLAN.IGN » est plus lourd ; on reste en raster pour la fluidité.
- **Clic parcelle hors départements importés** : les tuiles PCI exposent `idu`, `section`, `numero`, `contenance`, `code_insee` → la fiche « à la demande » démarre depuis ces propriétés, sans base.
- **Accès base** : client Supabase typé pour Auth/CRM (RLS) ; `postgres` (porsager) en direct pour les tuiles `ST_AsMVT` et l'ingestion (pas d'ORM : requêtes spatiales plus lisibles en SQL). Pas de Drizzle : les types seront générés par `supabase gen types`.
- **État UI** : Zustand (module, fond, calques, parcelle sélectionnée) ; TanStack Query pour les données serveur.
- **Mode démo** : sans variables Supabase, le middleware laisse tout accessible (utile pour développer la carte sans backend).
- **Tailwind v4** (livré par create-next-app 15) avec tokens CSS ; composants shadcn écrits à la main dans `src/components/ui` (même API que shadcn/ui) pour éviter la dépendance réseau au registre.
- **Polices** : package `geist` (fichiers embarqués) au lieu de `next/font/google` (pas d'appel réseau au build).

## Étape 3 — ingestion
- **Idempotence** : upsert (`on conflict`) pour les entités à clé (parcelles, bâtiments, mutations, DPE, zones, permis) ; « remplacement par département » (delete + insert) pour les tables de liens et les snapshots (bat_parcelle, rnic, personnes morales, loyers). Chaque étape journalise `ingest_runs`.
- **Chargement massif** : CSV → table de staging UNLOGGED via `COPY` (flux, pas de parsing en mémoire), puis `INSERT … SELECT` SQL. Le cadastre (une Feature par ligne) est lu en flux ligne à ligne.
- **Téléchargements** : cache `.data/` (ou `INGEST_CACHE_DIR`), **reprise par Range + nouvelles tentatives** — constaté : le proxy a coupé un transfert de 376 Mo à 230 Ko sans erreur HTTP.
- **Résolution d'URL** : les URLs `static.data.gouv.fr/resources/…` changent à chaque publication → résolues par l'API data.gouv (`lib/datagouv.ts`). L'export BDNB par département est déduit du motif de l'export France.
- **DVF — prix au m²** (règles SQL = `summarizeMutation`, testée) : seulement nature « Vente », valeur > 0, surface bâtie logement > 9 m², aucun local d'activité mêlé. Valeur d'une mutation à plusieurs dispositions = somme (une valeur par disposition). Le prix d'une mutation multi-parcelles s'applique à chaque parcelle (limite connue).
- **Bâti ↔ parcelle** : un groupe de bâtiments BDNB lié à N parcelles est réparti à parts égales (emprise, logements). Approximation assumée (pas d'intersection géométrique, trop coûteuse à l'échelle du département).
- **Passoire thermique** : au moins un DPE F ou G (existant ou neuf) de moins de 10 ans rattaché à la parcelle (rattachement par point BAN du DPE dans la parcelle). Étiquette « dernière » = DPE le plus récent.
- **Propriétaire PM principal** : on privilégie les « personnes morales non remarquables » (sociétés : SCI, SAS…) sur le public (communes, État, HLM…).
- **Sitadel** : `IDU = INSEE + 000 + section(2) + numéro(4)` (le préfixe de commune fusionnée n'est pas fourni). Les fichiers démolir/aménager utilisent `NUM_PD/NUM_PA` et n'ont pas de `TYPE_DAU` : gérés dans `sitadel.ts`.
- **Permis « voisinage »** : comptage par cellules 300 m (EPSG:3857, ≈ 210 m réels) en 3×3, permis des 3 dernières années — plus rapide qu'un `ST_DWithin` par parcelle.
- **LOVAC** : taux = vacants/parc privé au 01/01/2024 (même date de référence) ; « s » = secret statistique ignoré.
- **Volumes réels du 74** (14/11/2026) : 1 561 778 parcelles, 361 853 groupes de bâtiments, 139 613 mutations DVF (juil. 2021 → juin 2026), 251 948 DPE (dont 205 401 existants = total API), 32 839 zones PLU, 49 910 autorisations Sitadel, 16 353 copropriétés RNIC, 300 955 couples parcelle×SIREN.

## Étape 4 — carte & tuiles
- **Compression des tuiles** : Next.js supprime `Content-Encoding` des réponses de Route Handlers (`next/dist/server/send-response.js`, liste `FORBIDDEN_HEADERS`) → un gzip manuel produit des tuiles illisibles (« Unable to parse the tile… gzipped »). On sert donc les MVT bruts et on laisse la compression au serveur/CDN ; on limite le volume à la source (zooms minimaux par couche, simplification, DVF « prix/m² » seulement sous z14).
- **Tuiles** : `/api/tiles/{couche}/{z}/{x}/{y}.pbf?f=<filtres base64url>`, SQL `ST_AsMVT` entièrement paramétré (filtres validés par Zod, `buildWhere`). Zoom minimal par couche (parcelles 14, bâtiments 15, DVF 11, PLU 10, permis 13, copros 12, points de score 8) ; en dessous : 204. Cache CDN `s-maxage` tant que les droits ne dépendent pas de l'utilisateur (étape 12 : `private`).
- **Parcelles** : double rendu — traits/survol/clic/numéros via les tuiles PCI de l'IGN (France entière) ; remplissage coloré (DPE, score, personnes morales) via nos tuiles PostGIS (propriétés compactes `c, dpe, s, pm, pg…`).
- **Calques exclusifs** : DPE / score / personnes morales recolorent tous les trois les parcelles → un seul actif à la fois (`PARCEL_COLOR_GROUP`).
- **Popups** : construits avec `textContent` (jamais d'`innerHTML`) → pas d'injection depuis les données de tuile.
- **Mesure (14/11/2026, PostGIS local, dép. 74)** : tuile parcelles z16 ≈ 25 ms / 17 Ko ; z14 ≈ 45 ms / 70 Ko ; DVF z13 ≈ 60 ms ; PLU z12 ≈ 45 ms.
