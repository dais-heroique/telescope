import { describe, expect, it } from "vitest";
import { clusterContiguous, indicativeFloorArea } from "./clusters";

const sq = (x: number, y: number) => [[[x, y], [x + 0.0001, y], [x + 0.0001, y + 0.0001], [x, y + 0.0001], [x, y]]];

describe("parcelles contiguës", () => {
  it("regroupe les parcelles qui partagent une frontière", () => {
    const g = clusterContiguous([{ id: "A", rings: sq(6, 45) }, { id: "B", rings: sq(6.0001, 45) }, { id: "C", rings: sq(6.0002, 45) }, { id: "D", rings: sq(6.01, 45.01) }]);
    expect(g).toHaveLength(1);
    expect(g[0].sort()).toEqual(["A", "B", "C"]);
  });
  it("ignore un simple contact par un coin", () => {
    expect(clusterContiguous([{ id: "A", rings: sq(6, 45) }, { id: "B", rings: sq(6.0001, 45.0001) }])).toHaveLength(0);
  });
  it("surface de plancher indicative", () => {
    expect(indicativeFloorArea(1000, { emprise: 0.35, niveaux: 3, rendementSurfacePlancher: 0.85 })).toBe(893);
  });
});
