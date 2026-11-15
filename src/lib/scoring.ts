import { SCORING } from "../../config/scoring";

export interface ScoreInput {
  nbBatiments: number;
  holdYears: number | null;
  lastSaleDate: string | null;
  lastSalePrixM2: number | null;
  lastSaleType: string | null;
  dpeLatest: string | null;
  isPassoire: boolean;
  dpeWorst: string | null;
  isPm: boolean;
  pmGroupe: string | null;
  pmForme: string | null;
  nbPermis5y: number;
  nbPermisProches: number;
  anneeConstruction: number | null;
  isDivisible: boolean;
  isMonopropriete: boolean;
  isDentCreuse: boolean;
  /** Immeuble en copropriété : la « dernière vente » est celle d'un lot, pas du bien → pas de facteur de détention. */
  collectifCopro?: boolean;
}

export interface CommuneContext {
  cycleYears: number | null;
  turnoverPct: number | null;
  prixM2Median: number | null;
  vacancePct: number | null;
}

export interface Factor {
  label: string;
  points: number;
  detail?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Score 0–100 + facteurs explicables. Fonction pure (testée). */
export function scoreParcel(f: ScoreInput, c: CommuneContext): { score: number; factors: Factor[] } {
  const S = SCORING;
  const factors: Factor[] = [];
  const add = (label: string, points: number, detail?: string) => {
    const p = Math.round(points);
    if (p !== 0) factors.push({ label, points: p, detail });
  };

  // 1. Détention (fenêtre DVF = juillet 2021 → aujourd'hui)
  const built = f.nbBatiments > 0;
  if (!f.collectifCopro) {
    if (f.holdYears !== null) {
      if (f.holdYears < S.holding.recentSale.years) add("Acquisition récente", S.holding.recentSale.points, `vendu il y a ${r1(f.holdYears)} an`);
      else if (f.holdYears < S.holding.recentSale2.years) add("Acquisition récente", S.holding.recentSale2.points, `vendu il y a ${r1(f.holdYears)} ans`);
      else {
        const t = clamp((f.holdYears - S.holding.rampFromYears) / (S.holding.unknownSaleYears - S.holding.rampFromYears), 0, 1);
        add("Durée de détention", S.holding.rampMaxPoints * t, `${r1(f.holdYears)} ans depuis la dernière vente`);
      }
    } else if (built) {
      add("Durée de détention", S.holding.unknownPoints, `aucune vente depuis juillet 2021 (≥ ${r1(S.holding.unknownSaleYears)} ans)`);
    }
  }

  // 2. Passoire thermique et calendrier de location
  if (f.isPassoire && (f.dpeLatest === "G" || f.dpeLatest === "F" || f.dpeWorst === "G" || f.dpeWorst === "F")) {
    const worst = f.dpeWorst === "G" || f.dpeLatest === "G" ? "G" : "F";
    add("Passoire thermique", S.passoire[worst], worst === "G" ? "G : location interdite depuis 2025" : "F : location interdite dès 2028");
  } else if (f.dpeWorst === "E") add("DPE E", S.passoire.E, "location interdite dès 2034");

  // 3. Propriétaire
  if (f.isPm && f.pmGroupe === "personnes morales non remarquables" && /^(soci[ée]t[ée]|sas|sa |sarl|eurl|autre soci)/i.test(f.pmForme ?? "")) add("Propriété d'une société", S.societePrivee, "SCI/SAS… : arbitrages patrimoniaux fréquents");

  // 4. Autorisations d'urbanisme
  if (f.nbPermis5y > 0) add("Permis sur la parcelle", S.permisParcelle, `${f.nbPermis5y} autorisation(s) en 5 ans`);
  if (f.nbPermisProches > 0) add("Activité immobilière locale", Math.min(S.permisVoisinage.max, f.nbPermisProches * S.permisVoisinage.perPermit), `${f.nbPermisProches} permis à proximité (3 ans)`);

  // 5. Contexte communal
  if (c.vacancePct !== null && c.vacancePct > S.vacance.threshold) add("Vacance communale élevée", Math.min(S.vacance.max, (c.vacancePct - S.vacance.threshold) * S.vacance.perPoint), `${r1(c.vacancePct)} % de logements vacants`);
  if (c.turnoverPct !== null && c.turnoverPct > S.turnover.threshold) add("Marché actif", Math.min(S.turnover.max, (c.turnoverPct - S.turnover.threshold) * S.turnover.perPoint), `${r1(c.turnoverPct)} % des biens vendus en 12 mois`);

  // 6. Ancienneté du bâti
  if (f.anneeConstruction) {
    const a = S.anciennete.find((x) => f.anneeConstruction! < x.before);
    if (a) add("Bâti ancien", a.points, `construit en ${f.anneeConstruction}`);
  }

  // 7. Détections « opportunité »
  if (f.isMonopropriete) add("Immeuble en monopropriété", S.monopropriete, "collectif sans copropriété immatriculée");
  if (f.isDivisible) add("Bien divisible", S.divisible);
  if (f.isDentCreuse) add("Dent creuse", S.dentCreuse);

  // 8. Plus-value latente
  if (f.lastSalePrixM2 && c.prixM2Median && f.lastSalePrixM2 > 0 && (f.lastSaleType === "Maison" || f.lastSaleType === "Appartement")) {
    const gain = c.prixM2Median / f.lastSalePrixM2 - 1;
    if (gain > S.plusValue.threshold) add("Plus-value latente", Math.min(S.plusValue.max, (gain / 0.1) * S.plusValue.perTenPct), `+${Math.round(gain * 100)} % vs prix d'achat (marché communal)`);
  }

  const score = Math.round(clamp(S.base + factors.reduce((a, x) => a + x.points, 0), 0, 100));
  return { score, factors: factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)) };
}
