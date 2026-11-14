import { describe, expect, it } from "vitest";
import { buildIdu, depFromInsee, parseIdu, rentalBanDate, summarizeMutation, toNumber, worstDpe } from "./parsers";

describe("IDU cadastraux", () => {
  it("construit l'IDU à 14 caractères", () => {
    expect(buildIdu("74010", "AB", 123)).toBe("74010000AB0123");
    expect(buildIdu("74010", "A", "55")).toBe("74010000" + "0A" + "0055");
    expect(buildIdu("74010", "DN", "0055", "000")).toBe("74010000DN0055");
  });
  it("supporte les préfixes de communes fusionnées", () => {
    expect(buildIdu("74010", "AB", 1, "12")).toBe("74010012AB0001");
  });
  it("parse un IDU et déduit le département", () => {
    expect(parseIdu("74010000DN0055")).toEqual({ insee: "74010", prefixe: "000", section: "DN", numero: "0055", dep: "74" });
    expect(parseIdu("2A004000AB0001")?.dep).toBe("2A");
    expect(parseIdu("97105000AB0001")?.dep).toBe("971");
    expect(parseIdu("invalide")).toBeNull();
  });
  it("département depuis INSEE", () => {
    expect(depFromInsee("74010")).toBe("74");
    expect(depFromInsee("2B033")).toBe("2B");
    expect(depFromInsee("97411")).toBe("974");
  });
});

describe("nombres français", () => {
  it("convertit virgule et espaces", () => {
    expect(toNumber("1 234,5")).toBe(1234.5);
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe("DPE", () => {
  it("renvoie l'étiquette la plus défavorable", () => {
    expect(worstDpe(["C", "F", "B"])).toBe("F");
    expect(worstDpe([null, undefined, "x"])).toBeNull();
  });
  it("calendrier d'interdiction de location", () => {
    expect(rentalBanDate("G")).toBe("2025-01-01");
    expect(rentalBanDate("F")).toBe("2028-01-01");
    expect(rentalBanDate("E")).toBe("2034-01-01");
    expect(rentalBanDate("D")).toBeNull();
  });
});

describe("agrégation d'une mutation DVF", () => {
  const base = { nature_mutation: "Vente", valeur_fonciere: "300000" };
  it("calcule le prix au m² d'un appartement", () => {
    const s = summarizeMutation([
      { ...base, type_local: "Appartement", surface_reelle_bati: "60" },
      { ...base, type_local: "Dépendance", surface_reelle_bati: "" },
    ]);
    expect(s.type_principal).toBe("Appartement");
    expect(s.prix_m2).toBe(5000);
  });
  it("ignore le prix/m² si local d'activité mêlé", () => {
    const s = summarizeMutation([
      { ...base, type_local: "Maison", surface_reelle_bati: "100" },
      { ...base, type_local: "Local industriel. commercial ou assimilé", surface_reelle_bati: "50" },
    ]);
    expect(s.prix_m2).toBeNull();
  });
  it("ignore une surface minuscule ou une valeur nulle", () => {
    expect(summarizeMutation([{ ...base, type_local: "Appartement", surface_reelle_bati: "5" }]).prix_m2).toBeNull();
    expect(summarizeMutation([{ nature_mutation: "Vente", valeur_fonciere: "0", type_local: "Maison", surface_reelle_bati: "90" }]).prix_m2).toBeNull();
  });
  it("ignore les natures autres que Vente (ex. VEFA, adjudication)", () => {
    expect(summarizeMutation([{ nature_mutation: "Vente en l'état futur d'achèvement", valeur_fonciere: "300000", type_local: "Appartement", surface_reelle_bati: "60" }]).prix_m2).toBeNull();
  });
});
