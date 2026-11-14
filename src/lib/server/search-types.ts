/** Types partagés (sans dépendance serveur) pour la recherche. */
export type SortKey = "score" | "surface" | "prix" | "vente" | "detention" | "logements";
export const SORT_LABELS: Record<SortKey, string> = {
  score: "Score de vente",
  surface: "Surface parcelle",
  prix: "Prix dernière vente",
  vente: "Vente la plus récente",
  detention: "Durée de détention",
  logements: "Nb logements",
};
