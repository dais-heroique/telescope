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
