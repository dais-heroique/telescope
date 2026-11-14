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
