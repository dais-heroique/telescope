import { describe, expect, it } from "vitest";
import { scoreParcel, type CommuneContext, type ScoreInput } from "./scoring";

const base: ScoreInput = {
  nbBatiments: 1, holdYears: 8, lastSaleDate: "2018-01-01", lastSalePrixM2: 3000, lastSaleType: "Maison", dpeLatest: "D", isPassoire: false, dpeWorst: "D", isPm: false, pmGroupe: null, pmForme: null,
  nbPermis5y: 0, nbPermisProches: 0, anneeConstruction: 2010, isDivisible: false, isMonopropriete: false, isDentCreuse: false,
};
const ctx: CommuneContext = { cycleYears: 8, turnoverPct: 1, prixM2Median: 3000, vacancePct: 3 };

describe("score de probabilité de vente", () => {
  it("reste dans [0, 100] et additionne les facteurs", () => {
    const { score, factors } = scoreParcel(base, ctx);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(Math.round(10 + factors.reduce((a, f) => a + f.points, 0)));
  });
  it("une acquisition récente pénalise", () => {
    const recent = scoreParcel({ ...base, holdYears: 0.4 }, ctx);
    const old = scoreParcel({ ...base, holdYears: 12 }, ctx);
    expect(recent.score).toBeLessThan(old.score);
    expect(recent.factors.some((f) => f.label === "Acquisition récente" && f.points < 0)).toBe(true);
  });
  it("une détention longue au regard du cycle local augmente le score (plafonnée)", () => {
    const a = scoreParcel({ ...base, holdYears: 10 }, ctx).score;
    const b = scoreParcel({ ...base, holdYears: 40 }, ctx).score;
    expect(a).toBeGreaterThan(scoreParcel({ ...base, holdYears: 3 }, ctx).score);
    expect(b).toBe(scoreParcel({ ...base, holdYears: 14 }, ctx).score); // plafond atteint à 1,5 × cycle = 12 ans
  });
  it("passoire G > F > D", () => {
    const g = scoreParcel({ ...base, isPassoire: true, dpeLatest: "G", dpeWorst: "G" }, ctx).score;
    const f = scoreParcel({ ...base, isPassoire: true, dpeLatest: "F", dpeWorst: "F" }, ctx).score;
    expect(g).toBeGreaterThan(f);
    expect(f).toBeGreaterThan(scoreParcel(base, ctx).score);
  });
  it("les facteurs sont triés par poids absolu et explicables", () => {
    const { factors } = scoreParcel({ ...base, holdYears: 15, isPassoire: true, dpeLatest: "G", dpeWorst: "G", isMonopropriete: true, isPm: true, pmGroupe: "personnes morales non remarquables", pmForme: "Société civile immobilière" }, ctx);
    const abs = factors.map((f) => Math.abs(f.points));
    expect(abs).toEqual([...abs].sort((x, y) => y - x));
    expect(factors.every((f) => f.label.length > 0)).toBe(true);
  });
  it("sans vente connue, un bien bâti est supposé détenu depuis la fenêtre DVF", () => {
    const { factors } = scoreParcel({ ...base, holdYears: null, lastSaleDate: null }, ctx);
    expect(factors.find((f) => f.label === "Durée de détention")?.detail).toContain("≥");
  });
  it("pas de plus-value latente pour un local d'activité (prix/m² non comparable au résidentiel)", () => {
    const hot = { ...base, lastSalePrixM2: 1000 };
    expect(scoreParcel(hot, ctx).factors.some((f) => f.label === "Plus-value latente")).toBe(true);
    expect(scoreParcel({ ...hot, lastSaleType: "Local industriel. commercial ou assimilé" }, ctx).factors.some((f) => f.label === "Plus-value latente")).toBe(false);
  });
  it("une association n'est pas une société", () => {
    const pm = { ...base, isPm: true, pmGroupe: "personnes morales non remarquables" };
    expect(scoreParcel({ ...pm, pmForme: "Association déclarée" }, ctx).factors.some((f) => f.label === "Propriété d'une société")).toBe(false);
    expect(scoreParcel({ ...pm, pmForme: "SAS, société par actions simplifiée" }, ctx).factors.some((f) => f.label === "Propriété d'une société")).toBe(true);
  });
  it("pas de facteur de détention pour un immeuble en copropriété (vente d'un lot ≠ vente du bien)", () => {
    const { factors } = scoreParcel({ ...base, holdYears: 15, collectifCopro: true }, ctx);
    expect(factors.find((f) => f.label === "Durée de détention" || f.label === "Acquisition récente")).toBeUndefined();
  });
  it("terrain nu sans vente : pas de facteur de détention", () => {
    const { factors } = scoreParcel({ ...base, nbBatiments: 0, holdYears: null }, ctx);
    expect(factors.find((f) => f.label === "Durée de détention")).toBeUndefined();
  });
});
