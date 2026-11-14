import { rentalBanDate } from "@/lib/data/parsers";
import { pointInGeometry } from "@/lib/parcelle/geo";
import type { DpeEntry, EnergyReport, ParcelBase } from "@/lib/parcelle/types";
import { cached, fetchJson } from "../cache";
import { query } from "../db";

const addYears = (d: string | null, n: number) => (d ? `${Number(d.slice(0, 4)) + n}${d.slice(4)}` : null);

function finish(entries: DpeEntry[]): EnergyReport {
  const recent = entries.filter((e) => !e.validiteFin || e.validiteFin >= new Date().toISOString().slice(0, 10));
  const labels = recent.map((e) => e.etiquette);
  const worst = labels.length ? ["A", "B", "C", "D", "E", "F", "G"][Math.max(...labels.map((l) => "ABCDEFG".indexOf(l)))] : null;
  return { dpe: entries, passoire: recent.some((e) => e.etiquette === "F" || e.etiquette === "G"), worst };
}

export async function getEnergie(base: ParcelBase): Promise<EnergyReport> {
  if (base.mode === "imported") {
    const rows = await query<{ numero_dpe: string; kind: string; date_dpe: string | null; etiquette_dpe: string; etiquette_ges: string | null; type_batiment: string | null; surface: number | null; conso_m2_ep: number | null; adresse: string | null }>(
      "select numero_dpe, kind, date_dpe, etiquette_dpe, etiquette_ges, type_batiment, surface, conso_m2_ep, adresse from dpe where idu = ? order by date_dpe desc limit 100",
      [base.idu],
    );
    return finish(rows.map((r) => ({ numero: r.numero_dpe, kind: r.kind, date: r.date_dpe, etiquette: r.etiquette_dpe, ges: r.etiquette_ges, type: r.type_batiment, surface: r.surface, conso: r.conso_m2_ep, adresse: r.adresse, banDate: rentalBanDate(r.etiquette_dpe), validiteFin: addYears(r.date_dpe, 10) })));
  }
  // À la demande : DPE ADEME dans l'emprise de la parcelle, filtrés par appartenance du point BAN à la parcelle
  const [x0, y0, x1, y1] = base.bbox;
  const pad = 0.00003;
  const entries = await cached(`ademe:dpe:${base.idu}`, 7 * 86400, async () => {
    const out: DpeEntry[] = [];
    for (const [id, kind] of [["dpe03existant", "existant"], ["dpe02neuf", "neuf"]] as const) {
      const j = await fetchJson<{ results: Record<string, string | number>[] }>(
        `https://data.ademe.fr/data-fair/api/v1/datasets/${id}/lines?${new URLSearchParams({ bbox: `${x0 - pad},${y0 - pad},${x1 + pad},${y1 + pad}`, size: "200", select: "numero_dpe,date_etablissement_dpe,etiquette_dpe,etiquette_ges,type_batiment,surface_habitable_logement,conso_5_usages_par_m2_ep,adresse_ban,_geopoint" })}`,
        { timeoutMs: 12000 },
      );
      for (const r of j.results) {
        const [lat, lon] = String(r._geopoint ?? "").split(",").map(Number);
        if (!base.geometry || !Number.isFinite(lon) || !pointInGeometry([lon, lat], base.geometry)) continue;
        const d = String(r.date_etablissement_dpe ?? "") || null;
        out.push({ numero: String(r.numero_dpe), kind, date: d, etiquette: String(r.etiquette_dpe), ges: r.etiquette_ges ? String(r.etiquette_ges) : null, type: r.type_batiment ? String(r.type_batiment) : null, surface: typeof r.surface_habitable_logement === "number" ? r.surface_habitable_logement : null, conso: typeof r.conso_5_usages_par_m2_ep === "number" ? r.conso_5_usages_par_m2_ep : null, adresse: r.adresse_ban ? String(r.adresse_ban) : null, banDate: rentalBanDate(String(r.etiquette_dpe)), validiteFin: addYears(d, 10) });
      }
    }
    return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  });
  return finish(entries);
}
