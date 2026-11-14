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
  /** Fragment SQL (commence par « and … » ou vide), alias de table `f` = parcel_features. */
  text: string;
  params: (string | number | string[])[];
}

/**
 * Convertit les filtres en conditions SQL paramétrées.
 * `startAt` = index du premier paramètre `$n` disponible.
 */
export function buildWhere(filters: Filters, startAt: number): SqlWhere {
  const parts: string[] = [];
  const params: SqlWhere["params"] = [];
  const p = (v: string | number | string[], cast: string) => {
    params.push(v);
    return `$${startAt + params.length - 1}::${cast}`;
  };
  const between = (col: string, r: [number | null, number | null] | undefined, cast = "numeric") => {
    if (!r) return;
    if (r[0] !== null) parts.push(`${col} >= ${p(r[0], cast)}`);
    if (r[1] !== null) parts.push(`${col} <= ${p(r[1], cast)}`);
  };

  if (filters.usages?.length) parts.push(`f.usage_principal = any(${p(filters.usages, "text[]")})`);
  between("f.contenance", filters.surfParcelle);
  between("f.emprise_bati", filters.emprise);
  between("f.surface_libre", filters.surfLibre);
  between("f.last_sale_price", filters.prix);
  between("f.last_sale_prix_m2", filters.prixM2);
  if (filters.venduApres) parts.push(`f.last_sale_date >= ${p(filters.venduApres, "date")}`);
  if (filters.venduAvant) parts.push(`f.last_sale_date <= ${p(filters.venduAvant, "date")}`);
  between("f.hold_years", filters.detention);
  if (filters.dpe?.length) parts.push(`f.dpe_latest = any(${p(filters.dpe, "char(1)[]")})`);
  if (filters.plu?.length) parts.push(`${PLU_CLASS_SQL} = any(${p(filters.plu, "text[]")})`);
  between("f.annee_construction", filters.annee, "int");
  between("f.nb_logements", filters.logements, "int");
  if (filters.pm === "oui") parts.push("f.is_pm");
  if (filters.pm === "non") parts.push("not f.is_pm");
  if (filters.pm === "societes") parts.push("f.is_pm and f.pm_groupe = 'personnes morales non remarquables'");
  if (filters.pmNom) parts.push(`f.pm_denomination ilike ${p(`%${filters.pmNom.replace(/[%_\\]/g, "\\$&")}%`, "text")}`);
  if (filters.pmForme) parts.push(`f.pm_forme ilike ${p(`%${filters.pmForme.replace(/[%_\\]/g, "\\$&")}%`, "text")}`);
  if (filters.copro === "oui") parts.push("f.is_copro");
  if (filters.copro === "non") parts.push("not f.is_copro");
  if (filters.scoreMin !== undefined) parts.push(`f.score >= ${p(filters.scoreMin, "int")}`);
  for (const flag of filters.flags ?? []) {
    parts.push(
      { passoire: "f.is_passoire", divisible: "f.is_divisible", monopropriete: "f.is_monopropriete", dent_creuse: "f.is_dent_creuse" }[flag],
    );
  }
  return { text: parts.length ? parts.map((x) => ` and (${x})`).join("") : "", params };
}
