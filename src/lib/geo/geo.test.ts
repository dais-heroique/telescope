import { describe, expect, it } from "vitest";
import { decodeGeom, encodeGeom, geomBBox } from "./codec";
import { indexTiles, inlineTile, latToTileY, lonToTileX, pointTileRange, tileIndexSql } from "./tile-index";

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
  it("lecture d'une tuile : une géométrie mono-tuile est retrouvée depuis tuile exacte, enfant et parent", () => {
    const bb: [number, number, number, number] = [6.1294, 45.8992, 6.1295, 45.8993];
    const inl = inlineTile(bb)!;
    const spec = { table: "p", idCol: "idu", xCol: "tx", yCol: "ty" };
    // z16 exacte
    expect(tileIndexSql("i", 16, inl.x, inl.y, [16], spec).args.slice(0, 4)).toEqual([inl.x, inl.x, inl.y, inl.y]);
    // z17 enfant → même tuile z16
    expect(tileIndexSql("i", 17, inl.x * 2 + 1, inl.y * 2, [16], spec).args.slice(0, 4)).toEqual([inl.x, inl.x, inl.y, inl.y]);
    // z14 parent → plage contenant la tuile z16
    const [x0, x1, y0, y1] = tileIndexSql("i", 14, inl.x >> 2, inl.y >> 2, [16], spec).args;
    expect(inl.x).toBeGreaterThanOrEqual(x0);
    expect(inl.x).toBeLessThanOrEqual(x1);
    expect(inl.y).toBeGreaterThanOrEqual(y0);
    expect(inl.y).toBeLessThanOrEqual(y1);
  });
  it("une géométrie multi-tuiles est retrouvée via son niveau d'index (ancêtre)", () => {
    const big: [number, number, number, number] = [6.0, 45.8, 6.3, 46.0];
    const refs = indexTiles(big, [16, 14, 12, 10]);
    expect(inlineTile(big)).toBeNull();
    const t = refs[0];
    // une tuile z16 incluse dans la zone doit retrouver au moins une des tuiles indexées par ancêtre
    const x16 = (t.tx << (16 - t.z)) + 1, y16 = (t.ty << (16 - t.z)) + 1;
    const { sql, args } = tileIndexSql("i", 16, x16, y16, [16, 14, 12, 10]);
    expect(sql).toContain("z = " + t.z);
    const k = [16, 14, 12, 10].indexOf(t.z);
    expect(args.slice(k * 4, k * 4 + 2)).toEqual([x16 >> (16 - t.z), x16 >> (16 - t.z)]);
    expect(args[k * 4]).toBe(t.tx + (x16 >> (16 - t.z)) - t.tx);
  });
  it("plage de points", () => {
    expect(pointTileRange(13, 100, 200, 12)).toEqual({ x0: 50, x1: 50, y0: 100, y1: 100 });
    expect(pointTileRange(11, 10, 20, 12)).toEqual({ x0: 20, x1: 21, y0: 40, y1: 41 });
  });
});
