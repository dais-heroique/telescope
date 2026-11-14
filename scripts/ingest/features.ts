import { DETECTION } from "../../config/scoring";
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

    // ── Adresse : dernier DPE géocodé (BAN complète) sinon dernière vente DVF ──
    await q(`drop table if exists t_addr`);
    await q(`create temp table t_addr as
      select distinct on (idu) idu, adr from (
        select idu, adresse as adr, date_dpe as d, 1 as pr from dpe where dep = $1 and idu is not null and adresse is not null
        union all
        select mp.idu, m.adresse, m.date_mutation, 2 from dvf_mutation_parcelles mp join dvf_mutations m using (id_mutation)
        where mp.dep = $1 and m.adresse is not null
      ) x order by idu, pr, d desc nulls last`);
    await q(`create index on t_addr (idu)`);

    // ── Upsert des features ──
    await q(`insert into parcel_features (
        idu, dep, insee, contenance, nb_batiments, emprise_bati, surface_libre, annee_construction, nb_logements, nb_niveaux, hauteur_max, usage_principal, adresse,
        is_copro, copro_numero, copro_nb_lots, is_pm, pm_count, pm_siren, pm_denomination, pm_forme, pm_groupe,
        nb_ventes, last_sale_date, last_sale_price, last_sale_prix_m2, last_sale_type, hold_years,
        nb_dpe, dpe_latest, dpe_latest_date, dpe_worst, is_passoire, dpe_conso_m2,
        plu_type, plu_libelle, nb_permis_5y, last_permis_date, nb_permis_proches, computed_at)
      select p.idu, p.dep, p.insee, p.contenance,
        coalesce(b.nb, 0), round(b.emprise::numeric, 1),
        case when p.contenance is not null then greatest(p.contenance - coalesce(b.emprise, 0), 0) end,
        b.annee, b.nb_log, b.niveaux, b.hauteur, b.usage, ad.adr,
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
      left join t_addr ad on ad.idu = p.idu
      where p.dep = $1
      on conflict (idu) do update set
        insee = excluded.insee, contenance = excluded.contenance, nb_batiments = excluded.nb_batiments, emprise_bati = excluded.emprise_bati,
        surface_libre = excluded.surface_libre, annee_construction = excluded.annee_construction, nb_logements = excluded.nb_logements,
        nb_niveaux = excluded.nb_niveaux, hauteur_max = excluded.hauteur_max, usage_principal = excluded.usage_principal, adresse = excluded.adresse,
        is_copro = excluded.is_copro, copro_numero = excluded.copro_numero, copro_nb_lots = excluded.copro_nb_lots,
        is_pm = excluded.is_pm, pm_count = excluded.pm_count, pm_siren = excluded.pm_siren, pm_denomination = excluded.pm_denomination,
        pm_forme = excluded.pm_forme, pm_groupe = excluded.pm_groupe, nb_ventes = excluded.nb_ventes, last_sale_date = excluded.last_sale_date,
        last_sale_price = excluded.last_sale_price, last_sale_prix_m2 = excluded.last_sale_prix_m2, last_sale_type = excluded.last_sale_type,
        hold_years = excluded.hold_years, nb_dpe = excluded.nb_dpe, dpe_latest = excluded.dpe_latest, dpe_latest_date = excluded.dpe_latest_date,
        dpe_worst = excluded.dpe_worst, is_passoire = excluded.is_passoire, dpe_conso_m2 = excluded.dpe_conso_m2, plu_type = excluded.plu_type,
        plu_libelle = excluded.plu_libelle, nb_permis_5y = excluded.nb_permis_5y, last_permis_date = excluded.last_permis_date,
        nb_permis_proches = excluded.nb_permis_proches, computed_at = now()`);

    await detections(q);
    await communeStats(q);
    await sql`analyze parcel_features`;
    const [{ n }] = await sql<{ n: string }[]>`select count(*) n from parcel_features where dep = ${dep}`;
    return { rows: Number(n) };
  });
}

/** Détections « marchands de biens » (seuils : config/scoring.ts → DETECTION). */
async function detections(q: (text: string) => Promise<unknown>) {
  const D = DETECTION;
  const publicOwner = `(f.pm_groupe is not null and f.pm_groupe <> 'personnes morales non remarquables')`;
  // Monopropriété : immeuble collectif (≥ 2 logements, BDNB) sans immatriculation RNIC, hors propriétaire public/HLM
  await q(`update parcel_features f set is_monopropriete = coalesce(
      f.usage_principal = 'Résidentiel collectif' and coalesce(f.nb_logements, 0) >= ${D.monopropriete.minLogements} and not f.is_copro and not ${publicOwner}, false)
    where f.dep = $1`);
  // Bien divisible : grande parcelle bâtie en zone U/AU avec surface libre importante, ou grosse maison peu divisée
  await q(`update parcel_features f set is_divisible = coalesce(
      f.plu_type is not null and (f.plu_type like 'U%' or f.plu_type like 'AU%') and not ${publicOwner} and not f.is_copro and (
        (f.nb_batiments > 0 and coalesce(f.contenance, 0) >= ${D.divisible.minContenance} and coalesce(f.surface_libre, 0) >= ${D.divisible.minSurfaceLibre}
          and coalesce(f.emprise_bati, 0) >= ${D.divisible.minEmprise} and coalesce(f.nb_logements, 0) <= 2)
        or (f.usage_principal = 'Résidentiel individuel' and coalesce(f.emprise_bati, 0) * greatest(coalesce(f.nb_niveaux, 1), 1) >= ${D.divisible.bigHouseEmpriseNiveaux}
          and coalesce(f.nb_logements, 0) <= 2)), false)
    where f.dep = $1`);
  // Dent creuse : parcelle non bâtie en zone U/AU, entourée majoritairement de parcelles bâties
  await q(`update parcel_features f set is_dent_creuse = false where f.dep = $1`);
  await q(`update parcel_features f set is_dent_creuse = true
    from parcelles p
    where p.idu = f.idu and f.dep = $1 and f.nb_batiments = 0 and (f.plu_type like 'U%' or f.plu_type like 'AU%')
      and f.contenance between ${D.dentCreuse.minContenance} and ${D.dentCreuse.maxContenance}
      and (f.pm_groupe is null or f.pm_groupe = 'personnes morales non remarquables')
      and (select count(*) filter (where nf.nb_batiments > 0)::float / nullif(count(*), 0)
           from parcelles np join parcel_features nf on nf.idu = np.idu
           where np.idu <> p.idu and np.dep = $1 and st_dwithin(np.geom_3857, p.geom_3857, ${Math.round(D.dentCreuse.neighbourRadiusM / Math.cos((46 * Math.PI) / 180))})) >= ${D.dentCreuse.minBuiltNeighbours}`);
}

/**
 * Contexte communal pour le score : cycle de revente, rotation, prix médian, vacance.
 * Le cycle de revente se mesure sur les MAISONS : sur un immeuble, chaque vente de lot compterait comme une revente de la parcelle.
 */
async function communeStats(q: (text: string) => Promise<unknown>) {
  await q(`delete from commune_stats where dep = $1`);
  await q(`
    with sales as (
      select mp.idu, m.date_mutation, m.insee from dvf_mutation_parcelles mp join dvf_mutations m using (id_mutation)
      where mp.dep = $1 and m.nature = 'Vente' and m.valeur_fonciere > 0 and m.type_principal = 'Maison'
    ), gaps as (
      select insee, (date_mutation - lag(date_mutation) over (partition by idu order by date_mutation)) / 365.25 as y from sales
    ), cyc as (
      select insee, percentile_cont(0.5) within group (order by y) as cycle, count(*) as n from gaps where y is not null and y > 0.25 group by insee
    ), dep_cycle as (
      select percentile_cont(0.5) within group (order by y) as c from gaps where y is not null and y > 0.25
    ), turn as (
      select f.insee, 100.0 * count(*) filter (where f.last_sale_date >= current_date - interval '12 months') / nullif(count(*) filter (where f.nb_batiments > 0), 0) as t
      from parcel_features f where f.dep = $1 group by f.insee
    ), px as (
      select insee, percentile_cont(0.5) within group (order by prix_m2) as p from dvf_mutations
      where dep = $1 and prix_m2 is not null and type_principal in ('Maison', 'Appartement') and date_mutation >= current_date - interval '24 months' group by insee
    )
    insert into commune_stats (insee, dep, cycle_years, turnover_pct, prix_m2_median, vacance_pct)
    select t.insee, $1, case when c.n >= 30 then c.cycle else (select c from dep_cycle) end, t.t, px.p, v.taux_vacance
    from turn t left join cyc c using (insee) left join px using (insee) left join vacance_communes v on v.insee = t.insee`);
}
