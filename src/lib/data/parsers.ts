/** Parseurs purs (testés dans parsers.test.ts) : aucun accès réseau ni base ici. */

/** Construit un IDU cadastral (14 caractères) : INSEE(5) + préfixe(3) + section(2) + numéro(4). */
export function buildIdu(insee: string, section: string, numero: string | number, prefixe?: string | null): string {
  const sec = String(section).trim().toUpperCase().padStart(2, "0");
  const num = String(numero).trim().padStart(4, "0");
  const pre = (prefixe ?? "000").toString().trim().padStart(3, "0");
  return `${insee}${pre}${sec}${num}`;
}

/** IDU → composants. */
export function parseIdu(idu: string) {
  if (!/^[0-9AB]{5}[0-9]{3}[0-9A-Z]{2}[0-9]{4}$/.test(idu)) return null;
  return { insee: idu.slice(0, 5), prefixe: idu.slice(5, 8), section: idu.slice(8, 10), numero: idu.slice(10, 14), dep: depFromInsee(idu.slice(0, 5)) };
}

/** Code département depuis un code INSEE commune (gère DOM 97x et Corse 2A/2B). */
export function depFromInsee(insee: string): string {
  if (insee.startsWith("97") || insee.startsWith("98")) return insee.slice(0, 3);
  return insee.slice(0, 2);
}

/** Nombre au format français ("1 234,5") ou anglais → number | null. */
export function toNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type DpeLabel = "A" | "B" | "C" | "D" | "E" | "F" | "G";
const DPE_ORDER = "ABCDEFG";

export function isDpeLabel(v: unknown): v is DpeLabel {
  return typeof v === "string" && v.length === 1 && DPE_ORDER.includes(v);
}

/** Étiquette la plus défavorable (G > F > … > A). */
export function worstDpe(labels: (string | null | undefined)[]): DpeLabel | null {
  let w = -1;
  for (const l of labels) if (isDpeLabel(l)) w = Math.max(w, DPE_ORDER.indexOf(l));
  return w >= 0 ? (DPE_ORDER[w] as DpeLabel) : null;
}

/**
 * Calendrier d'interdiction de location des logements énergivores (loi Climat et Résilience).
 *  - 2025-01-01 : G (consommation > 450 kWh EF/m²/an → G entier depuis 2025)
 *  - 2028-01-01 : F
 *  - 2034-01-01 : E
 */
export const RENTAL_BAN: Record<"G" | "F" | "E", string> = { G: "2025-01-01", F: "2028-01-01", E: "2034-01-01" };

export function rentalBanDate(label: string | null | undefined): string | null {
  return label === "G" || label === "F" || label === "E" ? RENTAL_BAN[label] : null;
}

export interface DvfRow {
  id_mutation: string;
  date_mutation: string;
  nature_mutation: string;
  valeur_fonciere: string;
  id_parcelle: string;
  type_local: string;
  surface_reelle_bati: string;
  nombre_pieces_principales: string;
  surface_terrain: string;
  code_commune: string;
}

/** Types de locaux « logement » pour le calcul du prix au m². */
export const RESIDENTIAL = new Set(["Maison", "Appartement"]);

export interface MutationSummary {
  type_principal: string;
  surface_bati_res: number | null;
  prix_m2: number | null;
}

/**
 * Agrège les lignes d'une mutation DVF.
 * Règles (cf. docs/decisions.md) : prix/m² uniquement pour une vente de logement(s), valeur > 0,
 * surface bâtie > 9 m², et sans local d'activité mêlé (sinon le prix ne se rapporte pas au seul logement).
 */
export function summarizeMutation(
  rows: (Pick<DvfRow, "type_local" | "surface_reelle_bati" | "valeur_fonciere" | "nature_mutation"> & { surface_terrain?: string })[],
): MutationSummary {
  const valeur = toNumber(rows[0]?.valeur_fonciere);
  const types = new Set(rows.map((r) => r.type_local).filter(Boolean));
  const commercial = [...types].some((t) => t.startsWith("Local industriel"));
  const res = rows.filter((r) => RESIDENTIAL.has(r.type_local));
  // Les lignes d'une même mutation répètent la surface du local : on somme par ligne « local » (type + surface non nulle).
  const surfRes = res.reduce((a, r) => a + (toNumber(r.surface_reelle_bati) ?? 0), 0);
  const type_principal = types.has("Appartement")
    ? "Appartement"
    : types.has("Maison")
      ? "Maison"
      : commercial
        ? "Local industriel. commercial ou assimilé"
        : rows.some((r) => toNumber(r.surface_terrain ?? null)) && types.size === 0
          ? "Terrain"
          : "Autre";
  const ok = valeur !== null && valeur > 0 && surfRes > 9 && !commercial && rows[0]?.nature_mutation === "Vente";
  return { type_principal, surface_bati_res: surfRes > 0 ? surfRes : null, prix_m2: ok ? Math.round((valeur! / surfRes) * 100) / 100 : null };
}
