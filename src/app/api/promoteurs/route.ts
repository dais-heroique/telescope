import { z } from "zod";
import { PROMOTEUR } from "../../../../config/scoring";
import { clusterContiguous, indicativeFloorArea } from "@/lib/clusters";
import { decodeGeom } from "@/lib/geo/codec";
import { route } from "@/lib/server/api";
import { searchParcels, searchSchema } from "@/lib/server/search";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = searchSchema.omit({ limit: true, offset: true, sort: true }).extend({ minArea: z.number().min(0).max(1_000_000).default(0) });

interface Row { idu: string; contenance: number | null; surface_libre: number | null; plu_type: string | null; lon: number; lat: number; adresse: string | null; pm_siren: string | null; is_pm: number; geom: ArrayBuffer }

/** Agrégats de parcelles contiguës dans la sélection (filtres + zone/emprise), avec surface constructible INDICATIVE. */
export const POST = route({ body }, async ({ body }) => {
  const { minArea, ...search } = body;
  const res = await searchParcels<Row>({ ...search, sort: "surface", limit: 500, offset: 0 }, { columns: "f.idu, f.contenance, f.surface_libre, f.plu_type, f.lon, f.lat, f.adresse, f.pm_siren, f.is_pm, f.geom", rawLimit: 5000 });
  if (res.tooWide) return Response.json({ error: "zone trop large : zoomez ou dessinez une zone" }, { status: 400 });
  const byId = new Map(res.rows.map((r) => [r.idu, r]));
  const groups = clusterContiguous(res.rows.map((r) => ({ id: r.idu, rings: decodeGeom(r.geom).coordinates.map((p) => p[0]) })), 2);
  const clusters = groups
    .map((ids) => {
      const rows = ids.map((i) => byId.get(i)!);
      const surface = rows.reduce((a, r) => a + (r.contenance ?? 0), 0);
      const libre = rows.reduce((a, r) => a + (r.surface_libre ?? 0), 0);
      const owners = new Set(rows.map((r) => (r.is_pm && r.pm_siren ? r.pm_siren : `p:${r.idu}`)));
      const zones = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.plu_type ?? "?"]: (m[r.plu_type ?? "?"] ?? 0) + 1 }), {});
      return {
        idus: ids,
        n: ids.length,
        owners: owners.size,
        surface,
        surfaceLibre: Math.round(libre),
        zone: Object.entries(zones).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        lon: rows.reduce((a, r) => a + r.lon, 0) / rows.length,
        lat: rows.reduce((a, r) => a + r.lat, 0) / rows.length,
        adresse: rows.find((r) => r.adresse)?.adresse ?? null,
        floorArea: indicativeFloorArea(surface, PROMOTEUR),
      };
    })
    .filter((c) => c.surface >= minArea)
    .sort((a, b) => b.surface - a.surface)
    .slice(0, 100);
  return { clusters, assumptions: { emprise: PROMOTEUR.emprise, niveaux: PROMOTEUR.niveaux, rendement: PROMOTEUR.rendementSurfacePlancher }, truncated: res.truncated };
});
