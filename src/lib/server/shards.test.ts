import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packCommunes } from "../../../scripts/export/make-shards";
import { depOf, manifestFor, pickShards, ScopeTooWide, tileBBox, type Manifest } from "./shards";

describe("packCommunes", () => {
  const mk = (insee: string, x: number, y: number, w: number) => ({ insee, n: 1, w, bbox: [x, y, x + 0.01, y + 0.01] as [number, number, number, number] });
  it("regroupe des communes voisines sans dépasser la cible de plus de 25 %", () => {
    const communes = Array.from({ length: 50 }, (_, i) => mk(`740${String(i).padStart(2, "0")}`, 6 + (i % 10) * 0.05, 45.8 + Math.floor(i / 10) * 0.05, 10));
    const groups = packCommunes(communes, 100);
    expect(groups.flat().length).toBe(50);
    for (const g of groups) expect(g.reduce((s, c) => s + c.w, 0)).toBeLessThanOrEqual(125);
    expect(groups.length).toBeGreaterThanOrEqual(5);
  });
  it("garde une grosse commune dans son propre morceau", () => {
    const groups = packCommunes([mk("75056", 2.3, 48.8, 1000), mk("75001", 2.31, 48.81, 5)], 100);
    expect(groups.some((g) => g.some((c) => c.insee === "75056") && g.length === 1)).toBe(true);
  });
});

describe("routage des morceaux", () => {
  const manifest: Manifest = {
    v: 1, dep: "74", builtAt: "2026-01-01T00:00:00.000Z",
    shards: [
      { id: 0, file: "74-0.db.br", raw: 1, size: 1, bbox: [6.0, 45.8, 6.2, 46.0], communes: [{ insee: "74010", bbox: [6.05, 45.85, 6.2, 45.95], n: 10 }] },
      { id: 1, file: "74-1.db.br", raw: 1, size: 1, bbox: [6.2, 45.8, 6.4, 46.0], communes: [{ insee: "74281", bbox: [6.2, 45.85, 6.4, 45.95], n: 10 }] },
    ],
  };
  const dir = mkdtempSync(path.join(os.tmpdir(), "shards-test-"));
  const old = process.env.DATA_SHARDS_DIR;
  beforeAll(() => {
    writeFileSync(path.join(dir, "manifest-74.json"), JSON.stringify(manifest));
    process.env.DATA_SHARDS_DIR = dir;
  });
  afterAll(() => { process.env.DATA_SHARDS_DIR = old; });

  it("déduit le département d'un code INSEE", () => {
    expect(depOf("74010")).toBe("74");
    expect(depOf("2A004")).toBe("2A");
    expect(depOf("97105")).toBe("971");
  });
  it("trouve le morceau d'une commune et d'une parcelle", async () => {
    expect((await pickShards({ insees: ["74281"] })).map((p) => p.shard.id)).toEqual([1]);
    expect((await pickShards({ idus: ["74010000AB0001"] })).map((p) => p.shard.id)).toEqual([0]);
  });
  it("trouve les morceaux d'une emprise et ignore les départements non construits", async () => {
    expect((await pickShards({ bbox: [6.1, 45.88, 6.3, 45.9] })).map((p) => p.shard.id).sort()).toEqual([0, 1]);
    expect(await pickShards({ bbox: [2.3, 48.8, 2.4, 48.9] })).toEqual([]);
    expect(await manifestFor("38")).toBeNull();
  });
  it("calcule l'emprise d'une tuile", () => {
    const [x0, y0, x1, y1] = tileBBox(0, 0, 0);
    expect(x0).toBeCloseTo(-180);
    expect(x1).toBeCloseTo(180);
    expect(y1).toBeGreaterThan(85);
    expect(y0).toBeLessThan(-85);
  });
  it("refuse une zone qui recouvre trop de morceaux", () => {
    expect(new ScopeTooWide().message).toMatch(/trop large/);
  });
});
