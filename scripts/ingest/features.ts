import { db, trackRun } from "./lib/db";

/**
 * Précalcule `parcel_features` (une ligne par parcelle) à partir des tables importées.
 * Idempotent : upsert complet des colonnes de features ; les colonnes de score/détections ne sont pas touchées ici.
 * Notes de méthode : docs/decisions.md (clés de répartition bâti ↔ parcelle, définition de la passoire, voisinage de permis).
 */
export async function buildFeatures(dep: string) {
  return trackRun("features", dep, async () => {
    const sql = db();
    if (!/^(\d{2}|2[AB]|97\d)$/.test(dep)) throw new Error(`code département invalide : ${dep}`);
    // `dep` est validé ci-dessus : l'interpolation littérale est sûre (les CREATE TABLE AS n'acceptent pas les paramètres liés).
    const q = (text: string) => sql.unsafe(text.replaceAll("$1", `'${dep}'`));

    // ── Bâti : un groupe de bâtiments rattaché à N parcelles est réparti à parts égales ──
    await q(`drop table if exists t_bat`);
    await q(`create temp table t_bat as
      select bp.idu,
             count(*)::int as nb,
             sum(coalesce(b.surface_sol, 0) / nl.n) as emprise,
             min(nullif(b.annee_construction, 0)) as annee,
             round(sum(coalesce(b.nb_log, 0)::numeric / nl.n))::int as nb_log,
             max(b.nb_niveau) as niveaux,
             max(b.hauteur_max) as hauteur,
             (array_agg(b.usage_principal order by b.surface_sol desc nulls last))[1] as usage,
             bool_or(b.rnic_numero is not null) as copro,
             max(b.rnic_numero) as copro_numero,
             max(b.rnic_nb_lots) as copro_lots
      from bat_parcelle bp
      join batiments b on b.bg_id = bp.bg_id
      join (select bg_id, count(*) n from bat_parcelle where dep = $1 group by bg_id) nl on nl.bg_id = bp.bg_id
      where bp.dep = $1 group by bp.idu`);
    await q(`create index on t_bat (idu)`);

    // ── Copropriétés RNIC (rattachement par référence cadastrale) ──
    await q(`drop table if exists t_copro`);
    await q(`create temp table t_copro as
      select rp.idu, min(rp.numero) as numero, max(c.nb_lots) as nb_lots
      from rnic_parcelles rp join rnic_copros c on c.numero = rp.numero where rp.dep = $1 group by rp.idu`);
    await q(`create index on t_copro (idu)`);

    // ── Personnes morales : propriétaire « principal » = privé avant public, puis SIREN ──
    await q(`drop table if exists t_pm`);
    await q(`create temp table t_pm as
      select idu, count(distinct siren)::int as n,
             (array_agg(siren order by (groupe_personne is distinct from 'personnes morales non remarquables') asc, siren))[1] as siren,
             (array_agg(denomination order by (groupe_personne is distinct from 'personnes morales non remarquables') asc, siren))[1] as denomination,
             (array_agg(forme_juridique order by (groupe_personne is distinct from 'personnes morales non remarquables') asc, siren))[1] as forme,
             (array_agg(groupe_personne order by (groupe_personne is distinct from 'personnes morales non remarquables') asc, siren))[1] as groupe
      from pm_parcelles where dep = $1 group by idu`);
    await q(`create index on t_pm (idu)`);

    // ── Ventes (DVF) : on ne retient que les ventes (hors échanges, expropriations, adjudications) ──
    await q(`drop table if exists t_sales`);
    await q(`create temp table t_sales as
      select distinct on (mp.idu) mp.idu, count(*) over (partition by mp.idu)::int as n,
             m.date_mutation as d, m.valeur_fonciere as price, m.prix_m2, m.type_principal
      from dvf_mutation_parcelles mp join dvf_mutations m on m.id_mutation = mp.id_mutation
      where mp.dep = $1 and m.nature in ('Vente', 'Vente en l''état futur d''achèvement') and m.valeur_fonciere > 0
      order by mp.idu, m.date_mutation desc`);
    await q(`create index on t_sales (idu)`);

    // ── DPE (10 ans de validité) : « passoire » = au moins un DPE F ou G valide ──
    await q(`drop table if exists t_dpe`);
    await q(`create temp table t_dpe as
      select idu, count(*)::int as n,
             (array_agg(etiquette_dpe order by date_dpe desc nulls last))[1] as latest,
             max(date_dpe) as latest_date,
             max(etiquette_dpe) filter (where date_dpe >= current_date - interval '10 years') as worst,
             bool_or(etiquette_dpe in ('F','G') and date_dpe >= current_date - interval '10 years') as passoire,
             avg(conso_m2_ep) filter (where date_dpe >= current_date - interval '10 years') as conso
      from dpe where dep = $1 and idu is not null and kind in ('existant', 'neuf') group by idu`);
    await q(`create index on t_dpe (idu)`);

    // ── PLU : zone contenant le point intérieur de la parcelle (la plus petite en cas de chevauchement) ──
    await q(`drop table if exists t_plu`);
    await q(`create temp table t_plu as
      select distinct on (p.idu) p.idu, z.typezone, z.libelle
      from parcelles p join plu_zones z on z.dep = $1 and st_covers(z.geom, p.pt)
      where p.dep = $1 order by p.idu, st_area(z.geom) asc`);
    await q(`create index on t_plu (idu)`);

    // ── Permis : 5 ans sur la parcelle ; voisinage = permis des 3 dernières années dans les cellules 3×3 de 300 m (3857) ──
    await q(`drop table if exists t_permis`);
    await q(`create temp table t_permis as
      select pp.idu, count(distinct pe.num_dau)::int as n, max(pe.date_autorisation) as last_date
      from permis_parcelles pp join permis pe on pe.num_dau = pp.num_dau
      where pp.dep = $1 and pe.date_autorisation >= current_date - interval '5 years' and pe.type_dau in ('PC','DP','PA','PD')
      group by pp.idu`);
    await q(`create index on t_permis (idu)`);
    await q(`drop table if exists t_permis_cells`);
    await q(`create temp table t_permis_cells as
      select floor(st_x(st_transform(p.pt, 3857)) / 300)::int cx, floor(st_y(st_transform(p.pt, 3857)) / 300)::int cy, count(distinct pp.num_dau)::int n
      from permis_parcelles pp join permis pe on pe.num_dau = pp.num_dau join parcelles p on p.idu = pp.idu
      where pp.dep = $1 and pe.date_autorisation >= current_date - interval '3 years'
      group by 1, 2`);
    await q(`create index on t_permis_cells (cx, cy)`);

    // ── Upsert des features ──
    await q(`insert into parcel_features (
        idu, dep, insee, contenance, nb_batiments, emprise_bati, surface_libre, annee_construction, nb_logements, nb_niveaux, hauteur_max, usage_principal,
        is_copro, copro_numero, copro_nb_lots, is_pm, pm_count, pm_siren, pm_denomination, pm_forme, pm_groupe,
        nb_ventes, last_sale_date, last_sale_price, last_sale_prix_m2, last_sale_type, hold_years,
        nb_dpe, dpe_latest, dpe_latest_date, dpe_worst, is_passoire, dpe_conso_m2,
        plu_type, plu_libelle, nb_permis_5y, last_permis_date, nb_permis_proches, computed_at)
      select p.idu, p.dep, p.insee, p.contenance,
        coalesce(b.nb, 0), round(b.emprise::numeric, 1),
        case when p.contenance is not null then greatest(p.contenance - coalesce(b.emprise, 0), 0) end,
        b.annee, b.nb_log, b.niveaux, b.hauteur, b.usage,
        (c.idu is not null or coalesce(b.copro, false)), coalesce(c.numero, b.copro_numero), coalesce(c.nb_lots, b.copro_lots),
        (m.idu is not null), coalesce(m.n, 0), m.siren, m.denomination, m.forme, m.groupe,
        coalesce(s.n, 0), s.d, s.price, s.prix_m2, s.type_principal,
        case when s.d is not null then round(((current_date - s.d) / 365.25)::numeric, 1) end,
        coalesce(d.n, 0), d.latest, d.latest_date, d.worst, coalesce(d.passoire, false), round(d.conso::numeric, 0),
        z.typezone, z.libelle, coalesce(pm.n, 0), pm.last_date,
        coalesce((select sum(pc.n) from t_permis_cells pc
                  where pc.cx between floor(st_x(st_transform(p.pt, 3857)) / 300)::int - 1 and floor(st_x(st_transform(p.pt, 3857)) / 300)::int + 1
                    and pc.cy between floor(st_y(st_transform(p.pt, 3857)) / 300)::int - 1 and floor(st_y(st_transform(p.pt, 3857)) / 300)::int + 1), 0),
        now()
      from parcelles p
      left join t_bat b on b.idu = p.idu
      left join t_copro c on c.idu = p.idu
      left join t_pm m on m.idu = p.idu
      left join t_sales s on s.idu = p.idu
      left join t_dpe d on d.idu = p.idu
      left join t_plu z on z.idu = p.idu
      left join t_permis pm on pm.idu = p.idu
      where p.dep = $1
      on conflict (idu) do update set
        insee = excluded.insee, contenance = excluded.contenance, nb_batiments = excluded.nb_batiments, emprise_bati = excluded.emprise_bati,
        surface_libre = excluded.surface_libre, annee_construction = excluded.annee_construction, nb_logements = excluded.nb_logements,
        nb_niveaux = excluded.nb_niveaux, hauteur_max = excluded.hauteur_max, usage_principal = excluded.usage_principal,
        is_copro = excluded.is_copro, copro_numero = excluded.copro_numero, copro_nb_lots = excluded.copro_nb_lots,
        is_pm = excluded.is_pm, pm_count = excluded.pm_count, pm_siren = excluded.pm_siren, pm_denomination = excluded.pm_denomination,
        pm_forme = excluded.pm_forme, pm_groupe = excluded.pm_groupe, nb_ventes = excluded.nb_ventes, last_sale_date = excluded.last_sale_date,
        last_sale_price = excluded.last_sale_price, last_sale_prix_m2 = excluded.last_sale_prix_m2, last_sale_type = excluded.last_sale_type,
        hold_years = excluded.hold_years, nb_dpe = excluded.nb_dpe, dpe_latest = excluded.dpe_latest, dpe_latest_date = excluded.dpe_latest_date,
        dpe_worst = excluded.dpe_worst, is_passoire = excluded.is_passoire, dpe_conso_m2 = excluded.dpe_conso_m2, plu_type = excluded.plu_type,
        plu_libelle = excluded.plu_libelle, nb_permis_5y = excluded.nb_permis_5y, last_permis_date = excluded.last_permis_date,
        nb_permis_proches = excluded.nb_permis_proches, computed_at = now()`);
    await sql`analyze parcel_features`;
    const [{ n }] = await sql<{ n: string }[]>`select count(*) n from parcel_features where dep = ${dep}`;
    return { rows: Number(n) };
  });
}
