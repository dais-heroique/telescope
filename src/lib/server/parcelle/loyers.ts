import { parse } from "csv-parse/sync";
import { toNumber } from "@/lib/data/parsers";
import type { ParcelBase, RentReport } from "@/lib/parcelle/types";
import { cached } from "../cache";
import { query } from "../db";

const SLUG = "carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025";
const FILES: [string, RegExp][] = [["appartement", /^Indicateurs de loyer appartement$/i], ["maison", /^Indicateurs de loyer maison$/i]];

type Rent = RentReport["commune"][number];

/** Mode à la demande : CSV nationaux de la carte des loyers (5 Mo chacun), index par commune en mémoire. */
async function liveRents(insee: string): Promise<Rent[]> {
  return cached(`loyers:${insee}`, 30 * 86400, async () => {
    const ds = (await (await fetch(`https://www.data.gouv.fr/api/1/datasets/${SLUG}/`)).json()) as { resources: { title: string; format: string; url: string }[] };
    const out: Rent[] = [];
    for (const [type, re] of FILES) {
      const r = ds.resources.find((x) => re.test(x.title) && x.format === "csv");
      if (!r) continue;
      const buf = Buffer.from(await (await fetch(r.url)).arrayBuffer());
      const rows = parse(buf.toString("latin1"), { columns: true, delimiter: ";", skip_empty_lines: true }) as Record<string, string>[];
      const row = rows.find((x) => x.INSEE_C === insee);
      if (row) out.push({ insee, type, loyerM2: toNumber(row.loypredm2), min: toNumber(row["lwr.IPm2"]), max: toNumber(row["upr.IPm2"]), fiabilite: row.TYPPRED });
    }
    return out;
  });
}

export async function getLoyers(base: ParcelBase, opts: { surface?: number; type?: "appartement" | "maison"; prix?: number | null } = {}): Promise<RentReport> {
  let commune: Rent[];
  let vacance: RentReport["vacance"] = null;
  if (base.mode === "imported") {
    const rows = await query<{ type_bien: string; loyer_m2: number | null; loyer_m2_min: number | null; loyer_m2_max: number | null; fiabilite: string | null }>("select type_bien, loyer_m2, loyer_m2_min, loyer_m2_max, fiabilite from loyers_communes where insee = ?", [base.insee]);
    commune = rows.map((r) => ({ insee: base.insee, type: r.type_bien, loyerM2: r.loyer_m2, min: r.loyer_m2_min, max: r.loyer_m2_max, fiabilite: r.fiabilite }));
    const v = await query<{ taux_vacance: number | null; logements_vacants: number | null; logements_total: number | null }>("select taux_vacance, logements_vacants, logements_total from vacance_communes where insee = ?", [base.insee]);
    if (v[0]) vacance = { taux: v[0].taux_vacance, vacants: v[0].logements_vacants, total: v[0].logements_total };
  } else {
    commune = await liveRents(base.insee).catch(() => []);
  }
  let estimate: RentReport["estimate"] = null;
  const ref = commune.find((c) => c.type === (opts.type ?? "appartement")) ?? commune[0];
  if (ref?.loyerM2 && opts.surface) {
    const mensuel = Math.round(ref.loyerM2 * opts.surface);
    estimate = { surface: opts.surface, loyerMensuel: mensuel, loyerAnnuel: mensuel * 12, prix: opts.prix ?? null, rendementBrut: opts.prix ? Math.round(((mensuel * 12) / opts.prix) * 1000) / 10 : null, basis: `${ref.loyerM2.toLocaleString("fr-FR")} €/m² (${ref.type}, charges comprises, indicateur de commune)` };
  }
  return { commune, vacance, estimate };
}
