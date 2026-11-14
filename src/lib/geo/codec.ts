/**
 * Codec compact de géométries (Polygon/MultiPolygon) pour stockage BLOB dans libSQL.
 * Format : varints (LEB128) ; coordonnées quantifiées à 1e-6° (≈ 0,1 m), 1er point absolu puis deltas zig-zag.
 *   [nbPolygones] ( [nbAnneaux] ( [nbPoints] (x y)… )… )…
 */
const SCALE = 1e6;

class Writer {
  private buf = new Uint8Array(256);
  private len = 0;
  private ensure(n: number) {
    if (this.len + n > this.buf.length) {
      const b = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
      b.set(this.buf);
      this.buf = b;
    }
  }
  uint(v: number) {
    this.ensure(10);
    while (v >= 0x80) {
      this.buf[this.len++] = (v % 0x80) | 0x80;
      v = Math.floor(v / 0x80);
    }
    this.buf[this.len++] = v;
  }
  int(v: number) {
    this.uint(v >= 0 ? v * 2 : -v * 2 - 1);
  }
  bytes() {
    return this.buf.slice(0, this.len);
  }
}

class Reader {
  private pos = 0;
  constructor(private buf: Uint8Array) {}
  uint() {
    let v = 0, mul = 1, b: number;
    do {
      b = this.buf[this.pos++];
      v += (b & 0x7f) * mul;
      mul *= 0x80;
    } while (b & 0x80);
    return v;
  }
  int() {
    const u = this.uint();
    return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
  }
}

type Ring = number[][];
type Poly = Ring[];

export function toMultiPolygon(g: GeoJSON.Geometry): Poly[] {
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

export function encodeGeom(g: GeoJSON.Geometry): Uint8Array {
  const w = new Writer();
  const polys = toMultiPolygon(g);
  w.uint(polys.length);
  for (const poly of polys) {
    w.uint(poly.length);
    for (const ring of poly) {
      w.uint(ring.length);
      let px = 0, py = 0;
      for (const [lon, lat] of ring) {
        const x = Math.round(lon * SCALE), y = Math.round(lat * SCALE);
        w.int(x - px);
        w.int(y - py);
        px = x;
        py = y;
      }
    }
  }
  return w.bytes();
}

export function decodeGeom(bytes: Uint8Array | ArrayBuffer): GeoJSON.MultiPolygon {
  const r = new Reader(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const polys: Poly[] = [];
  const np = r.uint();
  for (let i = 0; i < np; i++) {
    const nr = r.uint();
    const poly: Poly = [];
    for (let j = 0; j < nr; j++) {
      const n = r.uint();
      const ring: Ring = [];
      let x = 0, y = 0;
      for (let k = 0; k < n; k++) {
        x += r.int();
        y += r.int();
        ring.push([x / SCALE, y / SCALE]);
      }
      poly.push(ring);
    }
    polys.push(poly);
  }
  return { type: "MultiPolygon", coordinates: polys };
}

export function geomBBox(g: GeoJSON.Geometry): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const poly of toMultiPolygon(g)) for (const [x, y] of poly[0] ?? []) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
