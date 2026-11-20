/**
 * Score « probabilité de vente » v1 : modèle heuristique pondéré et explicable.
 * Chaque facteur renvoie des points (positifs ou négatifs) affichés tels quels dans la fiche ; le score est
 * `base + Σ points`, borné à [0, 100]. Tous les poids se règlent ici.
 */
export const SCORING = {
  base: 10,
  /**
   * Durée de détention. Le DVF ouvert ne remonte qu'à juillet 2021 : une durée n'est connue que si une vente existe
   * dans cette fenêtre. Sans vente connue, le bien est détenu depuis au moins `unknownSaleYears` (signal positif forfaitaire).
   */
  holding: {
    unknownSaleYears: 5.3,
    unknownPoints: 12,
    /** Vente connue : 0 point à `rampFromYears`, `rampMaxPoints` à `unknownSaleYears`. */
    rampFromYears: 2,
    rampMaxPoints: 6,
    recentSale: { years: 1, points: -18 },
    recentSale2: { years: 2, points: -8 },
  },
  passoire: { G: 18, F: 14, E: 4 },
  societePrivee: 8,
  /** Permis déposés sur la parcelle (projet en cours) et activité immobilière du voisinage. */
  permisParcelle: 6,
  permisVoisinage: { perPermit: 0.8, max: 8 },
  /** Taux de vacance communal (parc privé, %). */
  vacance: { threshold: 6, perPoint: 0.9, max: 5 },
  anciennete: [
    { before: 1950, points: 6 },
    { before: 1975, points: 4 },
    { before: 2000, points: 2 },
  ],
  /** Rotation communale : ventes sur 12 mois / parcelles bâties, en %. */
  turnover: { threshold: 2, perPoint: 1.2, max: 8 },
  monopropriete: 10,
  divisible: 5,
  dentCreuse: 6,
  /** Plus-value latente : prix/m² communal actuel vs dernier prix d'achat. */
  plusValue: { threshold: 0.2, perTenPct: 2, max: 8 },
} as const;

/** Seuils des détections « marchands de biens » (appliqués en SQL dans scripts/ingest/features.ts, documentés ici). */
export const DETECTION = {
  // Immeuble d'habitation (≥ minLogements) détenu par une seule société privée, sans copropriété immatriculée
  monopropriete: { minLogements: 3 },
  // Maison sur un grand terrain dont la partie libre (à plus de recul m des bâtiments) forme un lot détachable accessible depuis la voie
  divisible: { minContenance: 1200, recul: 4, minLot: 500, minLargeurLot: 14, minFacadeLot: 5 },
  // Terrain nu en zone urbaine (U) : non bâti, compact, accessible depuis la voie, entouré de parcelles bâties
  dentCreuse: { minContenance: 400, maxContenance: 5000, maxBatiM2: 15, minLargeur: 12, minCompacite: 0.25, minFacade: 6, minVoisinsBatis: 2, minPartVoisinsBatis: 0.5, permisRecentAns: 3 },
} as const;

/** Hypothèses INDICATIVES du module Promoteurs (le règlement de PLU n'est pas exploité automatiquement). */
export const PROMOTEUR = { emprise: 0.35, niveaux: 3, rendementSurfacePlancher: 0.85, minParcelles: 2 } as const;
