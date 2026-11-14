import { describe, expect, it } from "vitest";
import { decodeGeom, encodeGeom, geomBBox } from "./codec";
import { indexTiles, latToTileY, lonToTileX, pointTileRange, tileIndexSql } from "./tile-index";

const poly: GeoJSON.MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [[[[6.124772, 45.901631], [6.124788, 45.901634], [6.124846, 45.901489], [6.124772, 45.901631]], [[6.1248, 45.9016], [6.12481, 45.90161], [6.12482, 45.9016], [6.1248, 45.9016]]], [[[-1.5, 44.0], [-1.4, 44.0], [-1.4, 44.1], [-1.5, 44.0]]]],
};

describe("codec de géométries", () => {
  it("aller-retour exact à 1e-6°", () => {
    const back = decodeGeom(encodeGeom(poly));
    expect(back.coordinates).toEqual(poly.coordinates);
  });
  it("est compact", () => {
    expect(encodeGeom(poly).length).toBeLessThan(JSON.stringify(poly).length / 4);
  });
  it("bbox", () => {
    expect(geomBBox(poly)).toEqual([-1.5, 44.0, 6.124846, 45.901634]);
  });
});

describe("index de tuiles", () => {
  it("tuile de Lyon connue (z12)", () => {
    expect(lonToTileX(4.8357, 12)).toBe(2103);
    expect(latToTileY(45.764, 12)).toBe(1461);
  });
  it("une petite parcelle tient dans 1 tuile z16, une grande est reportée sur un niveau plus grossier", () => {
    const small: [number, number, number, number] = [6.1294, 45.8992, 6.1295, 45.8993];
    expect(indexTiles(small, [16, 14, 12])).toHaveLength(1);
    const big: [number, number, number, number] = [6.0, 45.8, 6.3, 46.0];
    const t = indexTiles(big, [16, 14, 12, 10]);
    expect(t[0].z).toBeLessThan(16);
    expect(t.length).toBeLessThanOrEqual(36);
  });
  it("lecture d'une tuile : ancêtre ou descendants, tout parent retrouve l'enfant", () => {
    // parcelle indexée en z16 → retrouvée depuis la tuile z17 enfant, z16 exacte et la tuile z14 parente
    const [ref] = indexTiles([6.1294, 45.8992, 6.1295, 45.8993], [16]);
    const z17x = ref.tx * 2, z17y = ref.ty * 2;
    expect(tileIndexSql("i", 17, z17x, z17y, [16]).args).toEqual([ref.tx, ref.ty]);
    expect(tileIndexSql("i", 16, ref.tx, ref.ty, [16]).args).toEqual([ref.tx, ref.ty]);
    const parent = tileIndexSql("i", 14, ref.tx >> 2, ref.ty >> 2, [16]).args;
    expect(ref.tx).toBeGreaterThanOrEqual(parent[0]);
    expect(ref.tx).toBeLessThanOrEqual(parent[1]);
    expect(ref.ty).toBeGreaterThanOrEqual(parent[2]);
    expect(ref.ty).toBeLessThanOrEqual(parent[3]);
  });
  it("plage de points", () => {
    expect(pointTileRange(13, 100, 200, 12)).toEqual({ x0: 50, x1: 50, y0: 100, y1: 100 });
    expect(pointTileRange(11, 10, 20, 12)).toEqual({ x0: 20, x1: 21, y0: 40, y1: 41 });
  });
});
