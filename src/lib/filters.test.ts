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
    const w = buildWhere({ surfParcelle: [500, null], dpe: ["F"], pmNom: "x'; drop table parcelles;--" });
    expect(w.text).toContain("f.contenance >= ?");
    expect(w.text).toContain("f.dpe_latest in (?)");
    expect(w.text).not.toContain("drop table");
    expect(w.params[0]).toBe(500);
    expect(w.params).toContain("%x'; drop table parcelles;--%");
  });

  it("échappe les jokers LIKE du nom de société", () => {
    expect(buildWhere({ pmNom: "50%_off" }).params[0]).toBe("%50\\%\\_off%");
  });

  it("filtre vide = aucune condition", () => {
    expect(buildWhere({})).toEqual({ text: "", params: [] });
  });

  it("autant de ? que de paramètres, dans l'ordre", () => {
    const w = buildWhere({ dpe: ["F", "G"], prixM2: [3000, 6000], scoreMin: 50 });
    expect((w.text.match(/\?/g) ?? []).length).toBe(w.params.length);
    expect(w.params).toEqual([3000, 6000, "F", "G", 50]);
  });

  it("drapeaux métier", () => {
    expect(buildWhere({ flags: ["passoire", "monopropriete"] }).text).toContain("f.is_passoire = 1");
    expect(buildWhere({ flags: ["monopropriete"] }).text).toContain("f.is_monopropriete = 1");
  });
});
