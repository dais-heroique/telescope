import { z } from "zod";

/**
 * Filtres combinables de la carte / liste / export. Un seul schéma, partagé par :
 *  - la route de tuiles (`/api/tiles/...?f=`)
 *  - la recherche (liste virtualisée) et l'export CSV/Excel
 * Les valeurs sont validées par Zod puis converties en SQL **paramétré** (aucune interpolation de valeur utilisateur).
 */
const range = z.tuple([z.number().nullable(), z.number().nullable()]);

export const DPE_LABELS = ["A", "B", "C", "D", "E", "F", "G"] as const;
export const PLU_TYPES = ["U", "AU", "A", "N"] as const;
export const USAGES = ["Résidentiel individuel", "Résidentiel collectif", "Tertiaire", "Industriel", "Agricole", "Annexe", "Autre"] as const;
export const FLAGS = ["passoire", "divisible", "monopropriete", "dent_creuse"] as const;

/** Classe de zone PLU (U, AU, A, N) déduite de `typezone` (U, AUc, AUs, A, Ah, N, Nh…). */
export const PLU_CLASS_SQL = `(case when f.plu_type like 'AU%' then 'AU' when f.plu_type like 'A%' then 'A' when f.plu_type like 'N%' then 'N' when f.plu_type like 'U%' then 'U' end)`;

export const filtersSchema = z
  .object({
    usages: z.array(z.string().max(60)).max(10).optional(),
    surfParcelle: range.optional(), // m²
    emprise: range.optional(), // m² bâtis au sol
    surfLibre: range.optional(), // m²
    prix: range.optional(), // € dernière vente
    prixM2: range.optional(), // €/m² dernière vente
    venduApres: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    venduAvant: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    detention: range.optional(), // années depuis la dernière mutation
    dpe: z.array(z.enum(DPE_LABELS)).max(7).optional(),
    plu: z.array(z.enum(PLU_TYPES)).max(4).optional(),
    annee: range.optional(), // année de construction
    logements: range.optional(), // nb de logements
    pm: z.enum(["oui", "non", "societes"]).optional(), // personne morale : toutes / aucune / sociétés privées (hors public)
    pmNom: z.string().trim().min(2).max(80).optional(),
    pmForme: z.string().trim().min(2).max(80).optional(),
    copro: z.enum(["oui", "non"]).optional(),
    scoreMin: z.number().min(0).max(100).optional(),
    flags: z.array(z.enum(FLAGS)).max(4).optional(),
  })
  .strict();

export type Filters = z.infer<typeof filtersSchema>;

export function parseFilters(raw: string | null | undefined): Filters {
  if (!raw) return {};
  if (raw.length > 4000) throw new Error("filtres trop volumineux");
  const json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  return filtersSchema.parse(json);
}

export function encodeFilters(f: Filters): string {
  const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)));
  return Object.keys(clean).length ? btoa(unescape(encodeURIComponent(JSON.stringify(clean)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") : "";
}

export interface SqlWhere {
  /** Fragment SQL (« and (…) and (…) » ou vide), alias de table `f` = parcelles. Paramètres positionnels `?`. */
  text: string;
  params: (string | number)[];
}

/** Convertit les filtres en conditions SQL (SQLite) paramétrées par `?`. Aucune valeur utilisateur n'est interpolée. */
export function buildWhere(filters: Filters): SqlWhere {
  const parts: string[] = [];
  const params: SqlWhere["params"] = [];
  const add = (cond: string, ...vals: (string | number)[]) => {
    parts.push(cond);
    params.push(...vals);
  };
  const between = (col: string, r: [number | null, number | null] | undefined) => {
    if (!r) return;
    if (r[0] !== null) add(`${col} >= ?`, r[0]);
    if (r[1] !== null) add(`${col} <= ?`, r[1]);
  };
  const inList = (col: string, vals: string[]) => add(`${col} in (${vals.map(() => "?").join(",")})`, ...vals);
  const likeEsc = (v: string) => `%${v.replace(/[%_\\]/g, "\\$&")}%`;

  if (filters.usages?.length) inList("f.usage_principal", filters.usages);
  between("f.contenance", filters.surfParcelle);
  between("f.emprise_bati", filters.emprise);
  between("f.surface_libre", filters.surfLibre);
  between("f.last_sale_price", filters.prix);
  between("f.last_sale_prix_m2", filters.prixM2);
  if (filters.venduApres) add("f.last_sale_date >= ?", filters.venduApres);
  if (filters.venduAvant) add("f.last_sale_date <= ?", filters.venduAvant);
  between("f.hold_years", filters.detention);
  if (filters.dpe?.length) inList("f.dpe_latest", filters.dpe);
  if (filters.plu?.length) inList(PLU_CLASS_SQL, filters.plu);
  between("f.annee_construction", filters.annee);
  between("f.nb_logements", filters.logements);
  if (filters.pm === "oui") add("f.is_pm = 1");
  if (filters.pm === "non") add("f.is_pm = 0");
  if (filters.pm === "societes") add("f.is_pm = 1 and f.pm_groupe = 'personnes morales non remarquables'");
  if (filters.pmNom) add("f.pm_denomination like ? escape '\\'", likeEsc(filters.pmNom));
  if (filters.pmForme) add("f.pm_forme like ? escape '\\'", likeEsc(filters.pmForme));
  if (filters.copro === "oui") add("f.is_copro = 1");
  if (filters.copro === "non") add("f.is_copro = 0");
  if (filters.scoreMin !== undefined) add("f.score >= ?", filters.scoreMin);
  for (const flag of filters.flags ?? []) {
    add({ passoire: "f.is_passoire = 1", divisible: "f.is_divisible = 1", monopropriete: "f.is_monopropriete = 1", dent_creuse: "f.is_dent_creuse = 1" }[flag]);
  }
  return { text: parts.map((x) => ` and (${x})`).join(""), params };
}
