# Avancement VIGIE

## Étape 1 — Scaffold (en cours de finalisation)
**Fait**
- Next.js 15 (App Router, TS strict), Tailwind v4, thème clair/sombre, identité VIGIE (logo SVG, palette encre + ambre).
- Carte MapLibre plein écran : Plan IGN, Satellite (ortho IGN), Cadastre seul ; parcelles vectorielles (tuiles PCI IGN) cliquables.
- Recherche : adresses (Géoplateforme/BAN), communes, références cadastrales (`74010 000 AB 0123` via API Carto).
- Panneaux gauche (recherche, fonds, calques + légendes) / droit (fiche, squelette d'onglets), sélecteur de module, palette ⌘K, Échap ferme la fiche.
- Supabase : clients SSR, middleware, magic link, migration 1 (extensions PostGIS, organisations, profils, rôles, RLS).
- Vitest + Playwright configurés ; `vercel.json`, `.env.example`.

**Reste à faire (étape 1)** : déploiement Vercel effectif (nécessite un projet Vercel lié au repo + variables d'env — action utilisateur).

**Problèmes / notes**
- Voir `docs/decisions.md` (MapLibre v5, wrapper de carte).

## Étape 2 — docs/sources.md ✅
**Fait** : chaque source a été appelée en réel (14/11/2026). Voir `docs/sources.md` (URL, format, licence, MAJ, mode) et la page publique `/sources` (alimentée par `src/config/sources.ts`).
**Constats importants**
- DVF : l'arborescence `files.data.gouv.fr/geo-dvf/latest/csv/` marquée « archive » fonctionne encore (fichier 74/2025 : 64 k lignes) ; les fichiers nationaux `full-{année}.csv.gz` servent de repli pérenne.
- BDNB : export **par département** disponible (567 Mo pour le 74) ; le millésime change dans l'URL.
- Personnes morales DGFiP : désormais en **Parquet** (version unifiée) → lecture par range-requests.
- LOVAC : **agrégé communal uniquement** en open data (pas de parcelle) → la vacance parcellaire n'est pas disponible.
- Cerema DVF+ : 503 au test → optionnel, non bloquant.
- Overpass (OSM) : non joignable depuis le sandbox ; BPE/Filosofi INSEE : URLs de fichiers à fixer à l'étape 10.
