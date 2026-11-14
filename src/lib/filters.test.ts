import { describe, expect, it } from "vitest";
import { buildWhere, encodeFilters, filtersSchema, parseFilters } from "./filters";

describe("filtres", () => {
  it("accepte des filtres valides et rejette les clés inconnues", () => {
    expect(filtersSchema.safeParse({ dpe: ["F", "G"], scoreMin: 60 }).success).toBe(true);
    expect(filtersSchema.safeParse({ dpe: ["Z"] }).success).toBe(false);
    expect(filtersSchema.safeParse({ nimporte: 1 }).success).toBe(false);
  });

  it("aller-retour encode/parse", () => {
    const f = { dpe: ["F" as const, "G" as const], pmNom: "SCI Écureuil", prixM2: [3000, null] as [number, null] };
    expect(parseFilters(encodeFilters(f))).toEqual(f);
    expect(parseFilters("")).toEqual({});
  });

  it("produit du SQL paramétré sans interpoler les valeurs", () => {
    const w = buildWhere({ surfParcelle: [500, null], dpe: ["F"], pmNom: "x'; drop table parcelles;--" }, 5);
    expect(w.text).toContain("$5::numeric");
    expect(w.text).toContain("$6::char(1)[]");
    expect(w.text).not.toContain("drop table");
    expect(w.params[0]).toBe(500);
    expect(w.params).toContain("%x'; drop table parcelles;--%");
  });

  it("échappe les jokers LIKE du nom de société", () => {
    const w = buildWhere({ pmNom: "50%_off" }, 1);
    expect(w.params[0]).toBe("%50\\%\\_off%");
  });

  it("filtre vide = aucune condition", () => {
    expect(buildWhere({}, 1)).toEqual({ text: "", params: [] });
  });

  it("drapeaux métier", () => {
    expect(buildWhere({ flags: ["passoire", "monopropriete"] }, 1).text).toContain("f.is_passoire");
    expect(buildWhere({ flags: ["monopropriete"] }, 1).text).toContain("f.is_monopropriete");
  });
});
