import type { Building, ParcelBase } from "@/lib/parcelle/types";
import { cached, fetchJson } from "../cache";
import { query } from "../db";

export async function getBati(base: ParcelBase): Promise<Building[]> {
  if (base.mode === "imported") {
    const rows = await query<{ bg_id: string; annee: number | null; nb_log: number | null; niv: number | null; h: number | null; u: string | null; s: number | null; cp: number }>(
      `select b.bg_id, b.annee_construction as annee, b.nb_log, b.nb_niveau as niv, b.hauteur_max as h, b.usage_principal as u, b.surface_sol as s,
              (b.rnic_numero is not null) as cp
       from bat_parcelle bp join batiments b using (bg_id) where bp.idu = ? order by b.surface_sol desc limit 50`,
      [base.idu],
    );
    return rows.map((r) => ({ id: r.bg_id, anneeConstruction: r.annee, nbLogements: r.nb_log, nbNiveaux: r.niv, hauteur: r.h, usage: r.u, surfaceSol: r.s, copro: Boolean(r.cp) }));
  }
  // Mode à la demande : API BDNB (PostgREST, sans clé)
  return cached(`bdnb:bati:${base.idu}`, 7 * 86400, async () => {
    const links = await fetchJson<{ batiment_groupe_id: string }[]>(
      `https://api.bdnb.io/v1/bdnb/donnees/rel_batiment_groupe_parcelle?parcelle_id=eq.${base.idu}&select=batiment_groupe_id&limit=50`,
    );
    if (!links.length) return [];
    const ids = links.map((l) => l.batiment_groupe_id).join(",");
    const rows = await fetchJson<
      { batiment_groupe_id: string; annee_construction: number | null; nb_log: number | null; nb_niveau: number | null; hauteur_mean: number | null; usage_principal_bdnb_open: string | null; s_geom_groupe: number | null; nb_log_rnc: number | null }[]
    >(
      `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?batiment_groupe_id=in.(${ids})&select=batiment_groupe_id,annee_construction,nb_log,nb_niveau,hauteur_mean,usage_principal_bdnb_open,s_geom_groupe,nb_log_rnc`,
    );
    return rows.map((r) => ({
      id: r.batiment_groupe_id,
      anneeConstruction: r.annee_construction,
      nbLogements: r.nb_log,
      nbNiveaux: r.nb_niveau,
      hauteur: r.hauteur_mean,
      usage: r.usage_principal_bdnb_open,
      surfaceSol: r.s_geom_groupe,
      copro: (r.nb_log_rnc ?? 0) > 0,
    }));
  });
}
