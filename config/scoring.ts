/**
 * Score « probabilité de vente » v1 : modèle heuristique pondéré et explicable.
 * Chaque facteur renvoie des points (positifs ou négatifs) affichés tels quels dans la fiche ; le score est
 * `base + Σ points`, borné à [0, 100]. Tous les poids se règlent ici.
 */
export const SCORING = {
  base: 10,
  /** Durée de détention rapportée au cycle de revente local (médiane des intervalles entre ventes d'une même parcelle). */
  holding: {
    maxPoints: 28,
    defaultCycleYears: 8,
    /** La fenêtre DVF commence en juillet 2021 : sans vente connue, la détention est au moins de cette durée. */
    unknownSaleYears: 5.3,
    startRatio: 0.5,
    fullRatio: 1.5,
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
  monopropriete: { minLogements: 2 },
  divisible: { minContenance: 1000, minSurfaceLibre: 650, minEmprise: 40, bigHouseEmpriseNiveaux: 260 },
  dentCreuse: { minContenance: 150, maxContenance: 3000, neighbourRadiusM: 15, minBuiltNeighbours: 0.6 },
} as const;

/** Hypothèses INDICATIVES du module Promoteurs (le règlement de PLU n'est pas exploité automatiquement). */
export const PROMOTEUR = { emprise: 0.35, niveaux: 3, rendementSurfacePlancher: 0.85, minParcelles: 2 } as const;
