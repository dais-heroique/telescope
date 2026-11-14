import type { ParcelBase, Synthese } from "@/lib/parcelle/types";
import { fmtDate, fmtEur, fmtM2 } from "@/lib/parcelle/format";
import { queryOne } from "../db";

type F = Record<string, number | string | null>;

export async function getSynthese(base: ParcelBase): Promise<Synthese> {
  const facts: Synthese["facts"] = [];
  const add = (label: string, value: string | null | undefined) => value && facts.push({ label, value });
  add("Adresse", base.address);
  add("Commune", base.commune ? `${base.commune} (${base.insee})` : base.insee);
  add("Référence", `${base.insee} ${base.idu.slice(5, 8)} ${base.section} ${base.numero}`);
  add("Surface cadastrale", base.contenance ? fmtM2(base.contenance) : null);
  if (base.mode !== "imported") return { mode: "live", facts, score: null, flags: [] };

  const f = await queryOne<F>("select * from parcelles where idu = ?", [base.idu]);
  if (!f) return { mode: "live", facts, score: null, flags: [] };
  if (f.nb_batiments) {
    add("Emprise bâtie", `${fmtM2(Number(f.emprise_bati))} · ${f.nb_batiments} bâtiment(s)`);
    add("Surface libre", fmtM2(Number(f.surface_libre)));
    add("Année de construction", f.annee_construction ? String(f.annee_construction) : null);
    add("Logements", f.nb_logements ? String(f.nb_logements) : null);
    add("Usage", f.usage_principal as string | null);
    add("Hauteur max", f.hauteur_max ? `${Number(f.hauteur_max).toFixed(0)} m` : null);
  }
  if (f.last_sale_date) {
    add("Dernière vente", `${fmtDate(String(f.last_sale_date))} · ${fmtEur(Number(f.last_sale_price))}${f.last_sale_prix_m2 ? ` (${fmtEur(Number(f.last_sale_prix_m2))}/m²)` : ""}`);
    add("Durée de détention", `${Number(f.hold_years).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} an(s)`);
  } else add("Dernière vente", "aucune vente DVF depuis juillet 2021");
  add("DPE", f.dpe_latest ? `${f.dpe_latest}${f.dpe_conso_m2 ? ` · ${f.dpe_conso_m2} kWh/m²/an` : ""} (${f.nb_dpe} diagnostic(s))` : null);
  add("Zone PLU", f.plu_type ? `${f.plu_type}${f.plu_libelle ? ` · ${f.plu_libelle}` : ""}` : null);
  add("Propriétaire", f.is_pm ? `${f.pm_denomination ?? f.pm_siren} (${f.pm_forme ?? f.pm_groupe})` : f.nb_batiments ? "Particulier (aucune donnée nominative)" : null);
  add("Copropriété", f.is_copro ? `Immatriculée${f.copro_nb_lots ? ` · ${f.copro_nb_lots} lots` : ""}` : null);
  if (Number(f.nb_permis_5y)) add("Permis (5 ans)", `${f.nb_permis_5y} sur la parcelle`);
  if (Number(f.nb_permis_proches)) add("Permis à proximité (3 ans)", `${f.nb_permis_proches}`);

  const flags: Synthese["flags"] = [];
  if (f.is_passoire) flags.push({ key: "passoire", label: "Passoire thermique (F/G)" });
  if (f.is_divisible) flags.push({ key: "divisible", label: "Bien divisible" });
  if (f.is_monopropriete) flags.push({ key: "monopropriete", label: "Immeuble en monopropriété probable" });
  if (f.is_dent_creuse) flags.push({ key: "dent_creuse", label: "Dent creuse" });
  let score: Synthese["score"] = null;
  if (f.score !== null && f.score !== undefined) {
    let factors: { label: string; points: number; detail?: string }[] = [];
    try { factors = JSON.parse(String(f.score_factors ?? "[]")); } catch { /* ignore */ }
    score = { value: Number(f.score), factors };
  }
  return { mode: "imported", facts, score, flags };
}
