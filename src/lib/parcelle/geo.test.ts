import { describe, expect, it } from "vitest";
import { aerialBBox, aerialUrl, bboxOf, haversine, pointInGeometry, projectRings } from "./geo";

const square: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[6.0, 45.0], [6.001, 45.0], [6.001, 45.001], [6.0, 45.001], [6.0, 45.0]]] };

describe("géo", () => {
  it("bbox d'une géométrie", () => {
    expect(bboxOf(square)).toEqual([6.0, 45.0, 6.001, 45.001]);
  });
  it("vignette : ratio en mètres respecté et parcelle contenue", () => {
    const b = bboxOf(square);
    const a = aerialBBox(b, 640, 400);
    expect(a[0]).toBeLessThan(b[0]);
    expect(a[2]).toBeGreaterThan(b[2]);
    const kLon = 111320 * Math.cos((45 * Math.PI) / 180);
    const ratio = ((a[2] - a[0]) * kLon) / ((a[3] - a[1]) * 110574);
    expect(ratio).toBeCloseTo(640 / 400, 1);
  });
  it("URL WMS : axes lat,lon", () => {
    const url = aerialUrl([6, 45, 6.01, 45.01]);
    expect(decodeURIComponent(url)).toContain("BBOX=45,6,45.01,6.01");
  });
  it("projection pixel dans la vignette", () => {
    const [p] = projectRings(square, [6.0, 45.0, 6.001, 45.001], 100, 100);
    expect(p.startsWith("M0.0,100.0L100.0,100.0")).toBe(true);
  });
  it("haversine ≈ 111 km par degré de latitude", () => {
    expect(haversine([0, 0], [0, 1])).toBeGreaterThan(111000);
    expect(haversine([0, 0], [0, 1])).toBeLessThan(111400);
  });
  it("point dans polygone", () => {
    expect(pointInGeometry([6.0005, 45.0005], square)).toBe(true);
    expect(pointInGeometry([6.01, 45.0], square)).toBe(false);
  });
});
