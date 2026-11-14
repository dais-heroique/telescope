import { describe, expect, it } from "vitest";
import { addressKey, renderTemplate, toParagraphs } from "./render";

describe("modèles de courriers", () => {
  it("remplace les variables et laisse visibles les inconnues", () => {
    expect(renderTemplate("Bonjour {{ destinataire }}, {{adresse_bien}} {{inconnue}}", { destinataire: "Mme X", adresse_bien: "1 rue A" })).toBe("Bonjour Mme X, 1 rue A {{inconnue}}");
  });
  it("découpe en paragraphes", () => {
    expect(toParagraphs("A\nB\n\n\nC\n")).toEqual(["A\nB", "C"]);
  });
  it("normalise les adresses (accents, casse, ponctuation)", () => {
    expect(addressKey("12, Rue de l'Église — 74000 Annecy")).toBe("12 rue de l eglise 74000 annecy");
    expect(addressKey("12 RUE DE L'EGLISE 74000 ANNECY")).toBe(addressKey("12, Rue de l'Église 74000 Annecy"));
  });
});
