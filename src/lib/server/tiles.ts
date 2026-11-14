import { buildWhere, type Filters } from "@/lib/filters";

export const TILE_LAYERS = ["parcelles", "bati", "dvf", "plu", "permis", "copros", "pts"] as const;
export type TileLayer = (typeof TILE_LAYERS)[number];

/** Zoom minimal servi par couche (au-dessous : tuile vide, pour protéger la base). */
export const MIN_ZOOM: Record<TileLayer, number> = { parcelles: 14, bati: 15, dvf: 11, plu: 10, permis: 13, copros: 12, pts: 8 };

// ⚠ PostGIS encode le type `numeric` en TEXTE dans les MVT : toujours caster en float8/int pour les propriétés numériques.
const EXTENT = 4096;
const BUFFER = 64;

export interface TileQuery {
  text: string;
  params: (string | number | string[])[];
}

/**
 * Construit la requête `ST_AsMVT` d'une couche. Paramètres communs : $1=z, $2=x, $3=y, $4=départements autorisés.
 * Tout est paramétré ; les filtres utilisateur passent par `buildWhere` (Zod + SQL paramétré).
 */
export function tileQuery(layer: TileLayer, z: number, x: number, y: number, deps: string[], filters: Filters = {}): TileQuery {
  const base: TileQuery["params"] = [z, x, y, deps];
  const env = `st_tileenvelope($1::int, $2::int, $3::int)`;
  const env4326 = `st_transform(${env}, 4326)`;
  const geom = (col: string, simplify = 0) =>
    `st_asmvtgeom(${simplify ? `st_simplify(${col}, ${simplify} * (40075016.68 / (256 * power(2, $1::int))))` : col}, ${env}, ${EXTENT}, ${BUFFER}, true)`;

  switch (layer) {
    case "parcelles": {
      const w = buildWhere(filters, 5);
      // petites parcelles ignorées à z14 ; simplification légère en dessous de z17
      return {
        text: `select st_asmvt(tile, 'parcelles', ${EXTENT}, 'g') as mvt from (
          select f.idu, f.contenance as c, f.dpe_latest as dpe, f.score as s, f.last_sale_prix_m2::float8 as pm2, f.hold_years::float8 as h,
                 f.plu_type as plu, f.is_pm as pm, f.pm_groupe as pg, f.is_copro as cp, f.is_passoire as ps, f.usage_principal as u,
                 f.annee_construction as an, f.nb_logements as nl, f.is_divisible as dv, f.is_monopropriete as mo,
                 ${geom("p.geom_3857", 0.2)} as g
          from parcelles p join parcel_features f using (idu)
          where p.geom_3857 && ${env} and f.dep = any($4::text[])
            and ($1::int >= 15 or coalesce(f.contenance, 0) >= 150)${w.text}
        ) tile where tile.g is not null`,
        params: [...base, ...w.params],
      };
    }
    case "bati":
      return {
        text: `select st_asmvt(tile, 'bati', ${EXTENT}, 'g') as mvt from (
          select b.bg_id as id, b.annee_construction as an, b.nb_log as nl, b.hauteur_max::float8 as h, b.usage_principal as u, b.surface_sol::float8 as s,
                 (b.rnic_numero is not null) as cp, ${geom("b.geom_3857")} as g
          from batiments b where b.geom_3857 && ${env} and b.dep = any($4::text[])
        ) tile where tile.g is not null`,
        params: base,
      };
    case "dvf":
      return {
        text: `select st_asmvt(tile, 'dvf', ${EXTENT}, 'g') as mvt from (
          select m.id_mutation as id, to_char(m.date_mutation, 'YYYY-MM-DD') as d, m.prix_m2::float8 as p, m.valeur_fonciere::float8 as v, m.type_principal as t,
                 ${geom("st_transform(m.geom, 3857)")} as g
          from dvf_mutations m where m.geom && ${env4326} and m.dep = any($4::text[]) and m.valeur_fonciere > 0
            and ($1::int >= 14 or m.prix_m2 is not null)
        ) tile where tile.g is not null`,
        params: base,
      };
    case "plu":
      return {
        text: `select st_asmvt(tile, 'plu', ${EXTENT}, 'g') as mvt from (
          select z.gid as id, z.typezone as t, z.libelle as l, ${geom("z.geom_3857", 0.5)} as g
          from plu_zones z where z.geom_3857 && ${env} and z.dep = any($4::text[])
        ) tile where tile.g is not null`,
        params: base,
      };
    case "permis":
      return {
        text: `select st_asmvt(tile, 'permis', ${EXTENT}, 'g') as mvt from (
          select pe.num_dau as id, pe.type_dau as t, pe.kind as k, to_char(pe.date_autorisation, 'YYYY-MM-DD') as d, pe.nb_logements as nl,
                 ${geom("st_transform(p.pt, 3857)")} as g
          from permis pe join lateral (select pp.idu from permis_parcelles pp where pp.num_dau = pe.num_dau limit 1) x on true
          join parcelles p on p.idu = x.idu
          where p.pt && ${env4326} and pe.dep = any($4::text[]) and pe.date_autorisation >= current_date - interval '5 years'
        ) tile where tile.g is not null`,
        params: base,
      };
    case "copros":
      return {
        text: `select st_asmvt(tile, 'copros', ${EXTENT}, 'g') as mvt from (
          select c.numero as id, c.nom as n, c.nb_lots as lots, c.periode_construction as per, ${geom("st_transform(c.geom, 3857)")} as g
          from rnic_copros c where c.geom && ${env4326} and c.dep = any($4::text[])
        ) tile where tile.g is not null`,
        params: base,
      };
    case "pts": {
      // Points « opportunités » pour la heatmap de score (z8-14) : parcelles notées ≥ 40 ou signalées.
      const w = buildWhere(filters, 5);
      return {
        text: `select st_asmvt(tile, 'pts', ${EXTENT}, 'g') as mvt from (
          select f.score as s, ${geom("st_transform(p.pt, 3857)")} as g
          from parcel_features f join parcelles p using (idu)
          where p.pt && ${env4326} and f.dep = any($4::text[]) and f.score >= 40${w.text}
        ) tile where tile.g is not null`,
        params: [...base, ...w.params],
      };
    }
  }
}
