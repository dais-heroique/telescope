import { decodeGeom } from "@/lib/geo/codec";
import { latToTileY, lonToTileX, tileIndexSql } from "@/lib/geo/tile-index";
import { haversine, pointInGeometry } from "@/lib/parcelle/geo";
import type { ParcelBase, UrbanReport } from "@/lib/parcelle/types";
import { cached, fetchJson, soft } from "../cache";
import { LEVELS, POINT_LEVEL } from "../data-schema";
import { query } from "../db";

type Zone = NonNullable<UrbanReport["zone"]>;
type GpuFeatures = { features: { properties: Record<string, string | null> }[] };
const pointGeom = (c: [number, number]) => encodeURIComponent(JSON.stringify({ type: "Point", coordinates: c }));

async function gpu<T extends GpuFeatures>(endpoint: string, c: [number, number]) {
  return cached(`gpu:${endpoint}:${c[0].toFixed(5)},${c[1].toFixed(5)}`, 7 * 86400, () => fetchJson<T>(`https://apicarto.ign.fr/api/gpu/${endpoint}?geom=${pointGeom(c)}`, { timeoutMs: 10000 }));
}

const SUP_LABELS: Record<string, string> = { ac1: "Monument historique", ac2: "Site inscrit/classé", ac4: "Site patrimonial remarquable", as1: "Captage d'eau potable", el7: "Alignement", i4: "Ligne électrique", pm1: "Plan de prévention des risques", pm3: "PPR technologique", t1: "Voie ferrée" };

async function zoneFor(base: ParcelBase): Promise<Zone | null> {
  if (base.mode === "imported") {
    const [lon, lat] = base.centroid;
    const idx = tileIndexSql("idx_plu_zones", 14, lonToTileX(lon, 14), latToTileY(lat, 14), [...LEVELS.plu_zones]);
    const rows = await query<{ typezone: string; libelle: string; libelong: string; urlfic: string | null; partition: string; geom: ArrayBuffer }>(
      `select typezone, libelle, libelong, urlfic, partition, geom from plu_zones where gid in (${idx.sql})`,
      idx.args,
    ).catch(() => []);
    // la zone la plus spécifique (dernière correspondance : le plus petit anneau) contenant le point
    const hits = rows.map((r) => ({ r, g: decodeGeom(r.geom) })).filter((x) => pointInGeometry(base.centroid, x.g));
    const best = hits.sort((a, b) => JSON.stringify(a.g).length - JSON.stringify(b.g).length)[0]?.r;
    if (best) return { type: best.typezone, libelle: best.libelle, libelong: best.libelong, doc: best.partition, url: best.urlfic?.startsWith("http") ? best.urlfic : null, partition: best.partition };
  }
  const j = await soft(gpu<GpuFeatures>("zone-urba", base.centroid));
  const p = j?.features[0]?.properties;
  return p ? { type: p.typezone, libelle: p.libelle, libelong: p.libelong, doc: p.idurba ?? null, url: p.urlfic?.startsWith("http") ? p.urlfic : null, partition: p.partition } : null;
}

export async function getUrbanisme(base: ParcelBase): Promise<UrbanReport> {
  const [zone, presc, sup] = await Promise.all([zoneFor(base), soft(gpu<GpuFeatures>("prescription-surf", base.centroid)), soft(gpu<GpuFeatures>("assiette-sup-s", base.centroid))]);

  let permis: UrbanReport["permis"] = [];
  let proches: UrbanReport["permisProches"] = [];
  if (base.mode === "imported") {
    const rows = await query<{ num_dau: string; type_dau: string | null; kind: string | null; date_autorisation: string | null; nb_logements: number | null; denom_dem: string | null }>(
      `select pe.num_dau, pe.type_dau, pe.kind, pe.date_autorisation, pe.nb_logements, pe.denom_dem from permis_parcelles pp join permis pe using (num_dau) where pp.idu = ? order by pe.date_autorisation desc limit 30`,
      [base.idu],
    );
    permis = rows.map((r) => ({ id: r.num_dau, type: r.type_dau, kind: r.kind, date: r.date_autorisation, logements: r.nb_logements, demandeur: r.denom_dem }));
    const [lon, lat] = base.centroid;
    const dLat = 300 / 110574, dLon = 300 / (111320 * Math.cos((lat * Math.PI) / 180));
    const near = await query<{ num_dau: string; type_dau: string | null; kind: string | null; date_autorisation: string | null; nb_logements: number | null; lon: number; lat: number }>(
      `select num_dau, type_dau, kind, date_autorisation, nb_logements, lon, lat from permis
       where tx between ? and ? and ty between ? and ? and lon between ? and ? and lat between ? and ? and date_autorisation >= date('now','-3 years')
       order by date_autorisation desc limit 80`,
      [lonToTileX(lon - dLon, POINT_LEVEL), lonToTileX(lon + dLon, POINT_LEVEL), latToTileY(lat + dLat, POINT_LEVEL), latToTileY(lat - dLat, POINT_LEVEL), lon - dLon, lon + dLon, lat - dLat, lat + dLat],
    );
    const own = new Set(permis.map((p) => p.id));
    proches = near
      .filter((n) => !own.has(n.num_dau))
      .map((n) => ({ id: n.num_dau, type: n.type_dau, kind: n.kind, date: n.date_autorisation, logements: n.nb_logements, distance: Math.round(haversine(base.centroid, [n.lon, n.lat])) }))
      .filter((n) => n.distance <= 300)
      .slice(0, 30);
  } else {
    // À la demande : Sitadel (DiDo) filtré sur la 1re référence cadastrale
    const rows = await soft(
      cached(`sitadel:${base.idu}`, 7 * 86400, async () => {
        const q = new URLSearchParams({ COMM: `eq:${base.insee}`, SEC_CADASTRE1: `eq:${base.section}`, NUM_CADASTRE1: `eq:${base.numero}`, columns: "NUM_DAU,TYPE_DAU,DATE_REELLE_AUTORISATION,NB_LGT_TOT_CREES,DENOM_DEM" });
        const res = await fetch(`https://data.statistiques.developpement-durable.gouv.fr/dido/api/v1/datafiles/8b35affb-55fc-4c1f-915b-7750f974446a/csv?${q}`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return [] as string[][];
        return (await res.text()).trim().split("\n").slice(1).map((l) => l.split(";").map((c) => c.replace(/^"|"$/g, "")));
      }),
    );
    permis = (rows ?? []).map((c) => ({ id: c[0], type: c[1], kind: "logement", date: c[2], logements: c[3] ? Number(c[3]) : null, demandeur: c[4] || null }));
  }

  const [lon, lat] = base.centroid;
  return {
    zone,
    prescriptions: (presc?.features ?? []).map((f) => ({ libelle: String(f.properties.libelle ?? "Prescription"), type: f.properties.typepsc ?? null })),
    servitudes: (sup?.features ?? []).map((f) => ({ type: f.properties.suptype ? (SUP_LABELS[f.properties.suptype.toLowerCase()] ?? f.properties.suptype.toUpperCase()) : null, fichier: f.properties.fichier ?? null })),
    permis,
    permisProches: proches,
    gpuUrl: `https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=${lon}&lat=${lat}&zoom=18`,
  };
}
