import { z } from "zod";
import departements from "@/lib/geo/departements.json";
import { STAGE_KEYS } from "@/lib/crm/types";
import { filtersSchema } from "@/lib/filters";
import { LAYERS } from "@/config/layers";
import { fetchJson } from "../cache";
import { leadByIdu, listLeads, listNotes, listTasks, logActivity, newId } from "../crm";
import { isWriteBlocked, run } from "../db";
import { buildEtude } from "../etude";
import { getBase } from "../parcelle/base";
import { getBati } from "../parcelle/bati";
import { getEnergie } from "../parcelle/energie";
import { getEntreprise } from "../parcelle/entreprise";
import { getEnvironnement } from "../parcelle/environnement";
import { getLoyers } from "../parcelle/loyers";
import { getProprietaire } from "../parcelle/proprietaire";
import { getRisques } from "../parcelle/risques";
import { getSynthese } from "../parcelle/synthese";
import { getUrbanisme } from "../parcelle/urbanisme";
import { getVentes } from "../parcelle/ventes";
import { searchParcels, SORTS } from "../search";
import { depOf, manifestFor, ScopeBusy, ScopeTooWide, withData } from "../shards";

/** Contexte d'un appel : adresse publique du site (pour fournir des liens vers la carte). */
export interface Ctx {
  origin: string;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  schema: z.ZodType;
  readOnly: boolean;
  run: (args: never, ctx: Ctx) => Promise<unknown>;
}

const IDU = z.string().regex(/^[0-9AB]{5}[0-9]{3}[0-9A-Z]{2}[0-9]{4}$/).describe("Identifiant de parcelle (14 caractères : INSEE 5 + préfixe 3 + section 2 + numéro 4), ex. 74010000BY0129");
const STAGES = STAGE_KEYS as [string, ...string[]];

/** Tronque les longues listes et textes pour garder des réponses lisibles par l'IA. */
function trim(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) {
    const out = v.slice(0, 25).map((x) => trim(x, depth + 1));
    if (v.length > 25) out.push({ omis: v.length - 25, note: "éléments supplémentaires non affichés" });
    return out;
  }
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "geometry" || k === "bbox") continue; // géométries volumineuses, inutiles ici
      o[k] = trim(x, depth + 1);
    }
    return o;
  }
  if (typeof v === "string" && v.length > 600) return v.slice(0, 600) + "…";
  return v;
}

const carte = (ctx: Ctx, idu: string) => `${ctx.origin}/carte?p=${idu}`;

const ORDERS = Object.keys(SORTS) as [keyof typeof SORTS, ...(keyof typeof SORTS)[]];

/** Emprise [ouest, sud, est, nord] d'une commune, lue dans les morceaux de données. */
async function communeBBox(insee: string): Promise<[number, number, number, number] | null> {
  const m = await manifestFor(depOf(insee));
  for (const s of m?.shards ?? []) for (const c of s.communes) if (c.insee === insee) return c.bbox;
  return null;
}

const SECTIONS = ["synthese", "bati", "ventes", "energie", "urbanisme", "proprietaire", "risques", "loyers", "environnement", "entreprise"] as const;

const searchArgs = z
  .object({
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional().describe("Emprise [ouest, sud, est, nord] en degrés WGS84 (longitude/latitude)"),
    centre: z.object({ lon: z.number(), lat: z.number() }).optional().describe("Centre d'un cercle de recherche (avec rayon_m)"),
    rayon_m: z.number().min(50).max(3000).optional().describe("Rayon en mètres autour du centre (50 à 3000)"),
    insee: z.string().regex(/^(\d{5}|2[AB]\d{3})$/).optional().describe("Code INSEE de la commune à explorer"),
    filtres: filtersSchema.optional().describe(
      "Filtres combinables : usages (« Résidentiel individuel », « Résidentiel collectif », « Tertiaire »…), surfParcelle/emprise/surfLibre [min,max] en m², prix/prixM2 [min,max], venduApres/venduAvant (AAAA-MM-JJ), detention [min,max] années, dpe ['D'…], plu ['U','AU','A','N'], annee [min,max] construction, logements [min,max], pm ('oui'|'non'|'societes'), pmNom, pmForme, copro ('oui'|'non'), scoreMin (0–100), flags (passoire = DPE F/G ; divisible = maison dont le jardin forme un lot détachable ≥ 500 m² accessible depuis la voie ; monopropriete = immeuble ≥ 3 logements détenu par une seule société, sans copropriété ; dent_creuse = terrain nu en zone U entouré de bâti, avec façade sur voie).",
    ),
    tri: z.enum(ORDERS).default("score").describe("Tri : score (probabilité de vente), surface, prix, vente (récente), detention, logements"),
    limite: z.number().int().min(1).max(50).default(20),
  })
  .strict();

const BAN_URL = "https://data.geopf.fr/geocodage/search";

export const TOOLS: Tool[] = [
  {
    name: "couverture_donnees",
    title: "Données disponibles dans VIGIE",
    description: "Décrit ce que contient VIGIE (couverture géographique, types de données, couches de la carte, limites). À appeler en premier pour savoir ce qui est possible.",
    schema: z.object({}).strict(),
    readOnly: true,
    run: async () => ({
      description:
        "VIGIE est un outil de prospection immobilière fondé sur des données publiques (cadastre, DVF, BDNB, DPE, PLU, permis de construire, copropriétés RNIC, personnes morales). Aucune donnée nominative sur des particuliers.",
      couverture: `France métropolitaine (${Object.keys(departements).filter((d) => d.length === 2 || d === "2A" || d === "2B").length} départements) et DOM. Parcelles bâties, notées ou détectées ; les terrains sans bâtiment sont affichés via le cadastre IGN.`,
      limites: [
        "Pas de score ni de détection dans les DOM (la base BDNB n'existe pas pour ces départements).",
        "Une recherche ne peut couvrir qu'une zone de quelques kilomètres : fournissez une commune (insee), un centre + rayon ou une emprise.",
        "Le score de probabilité de vente est une estimation heuristique (0–100) expliquée par ses facteurs ; ce n'est pas une certitude.",
        "Les données sont ouvertes et peuvent comporter des erreurs ou des retards de mise à jour.",
      ],
      outils: TOOLS_INDEX,
      couches_de_la_carte: LAYERS.map((l) => l.label),
    }),
  },
  {
    name: "chercher_adresse",
    title: "Trouver une adresse ou une commune",
    description: "Géocode une adresse, une commune ou un lieu (Géoplateforme IGN) : renvoie le libellé, le code INSEE, le code postal et les coordonnées (lon/lat). Sert à définir une zone de recherche.",
    schema: z.object({ q: z.string().min(2).max(200), limite: z.number().int().min(1).max(8).default(5) }).strict(),
    readOnly: true,
    run: async (a: { q: string; limite: number }) => {
      const j = await fetchJson<{ features: { geometry: { coordinates: [number, number] }; properties: { label: string; city?: string; citycode?: string; postcode?: string; type?: string; score?: number } }[] }>(
        `${BAN_URL}?${new URLSearchParams({ q: a.q, limit: String(a.limite) })}`,
      );
      return {
        resultats: j.features.map((f) => ({ libelle: f.properties.label, commune: f.properties.city, insee: f.properties.citycode, code_postal: f.properties.postcode, type: f.properties.type, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], pertinence: f.properties.score })),
      };
    },
  },
  {
    name: "rechercher_parcelles",
    title: "Rechercher des parcelles",
    description:
      "Liste les parcelles d'une zone (commune, centre + rayon ou emprise) qui satisfont des filtres, triées par score de probabilité de vente. Chaque parcelle indique adresse, usage, surface, année, dernière vente, DPE, propriétaire personne morale éventuel, score et lien vers la carte.",
    schema: searchArgs,
    readOnly: true,
    run: async (a: z.infer<typeof searchArgs>, ctx) => {
      let bbox = a.bbox;
      if (!bbox && a.centre) {
        const r = a.rayon_m ?? 500;
        const dLat = r / 111_320;
        const dLon = r / (111_320 * Math.cos((a.centre.lat * Math.PI) / 180));
        bbox = [a.centre.lon - dLon, a.centre.lat - dLat, a.centre.lon + dLon, a.centre.lat + dLat];
      }
      if (!bbox && a.insee) {
        bbox = (await communeBBox(a.insee)) ?? undefined;
        if (!bbox) return { erreur: `Commune ${a.insee} introuvable dans les données.` };
      }
      if (!bbox) return { erreur: "Précisez une zone : bbox, centre + rayon_m, ou insee." };
      let res;
      try {
        res = await searchParcels({ filters: a.filtres ?? {}, bbox, sort: a.tri, limit: a.limite, offset: 0 });
      } catch (e) {
        if (e instanceof ScopeBusy) return { erreur: "Données momentanément saturées, réessayez dans un instant." };
        throw e;
      }
      if (res.tooWide) return { erreur: "Zone trop large : réduisez la zone (une commune, ou un rayon de quelques centaines de mètres)." };
      const rows = res.rows.slice(0, a.limite);
      return {
        total_dans_la_zone: res.total,
        resultats_tronques: res.truncated,
        affiches: rows.length,
        parcelles: rows.map((r) => ({
          idu: r.idu,
          adresse: r.adresse,
          score: r.score,
          usage: r.usage_principal,
          surface_parcelle_m2: r.contenance,
          emprise_bati_m2: r.emprise_bati,
          annee_construction: r.annee_construction,
          logements: r.nb_logements,
          derniere_vente: r.last_sale_date ? { date: r.last_sale_date, prix: r.last_sale_price, prix_m2: r.last_sale_prix_m2 } : null,
          detention_annees: r.hold_years,
          dpe: r.dpe_latest,
          zone_plu: r.plu_type,
          proprietaire_personne_morale: r.is_pm ? { nom: r.pm_denomination, forme: r.pm_forme } : null,
          copropriete: Boolean(r.is_copro),
          signaux: [r.is_passoire && "passoire thermique", r.is_divisible && "divisible", r.is_monopropriete && "monopropriété", r.is_dent_creuse && "dent creuse"].filter(Boolean),
          lon: r.lon,
          lat: r.lat,
          carte: carte(ctx, r.idu),
        })),
      };
    },
  },
  {
    name: "fiche_parcelle",
    title: "Fiche détaillée d'une parcelle",
    description:
      "Fiche complète d'une parcelle : synthèse + score expliqué, bâti, ventes (parcelle et comparables), énergie (DPE), urbanisme (PLU, permis), propriétaire (personne morale, copropriété), risques, loyers, environnement, entreprise. Choisissez les sections utiles (par défaut : synthèse, ventes, énergie, urbanisme, propriétaire).",
    schema: z
      .object({
        idu: IDU,
        sections: z.array(z.enum(SECTIONS)).max(10).default(["synthese", "ventes", "energie", "urbanisme", "proprietaire"]),
        rayon_m: z.number().min(50).max(3000).default(500).describe("Rayon pour les ventes comparables et l'environnement"),
      })
      .strict(),
    readOnly: true,
    run: async (a: { idu: string; sections: (typeof SECTIONS)[number][]; rayon_m: number }, ctx) =>
      withData({ idus: [a.idu], near: true }, async () => {
        const base = await getBase(a.idu);
        if (!base) return { erreur: "Parcelle introuvable." };
        const loaders: Record<(typeof SECTIONS)[number], () => Promise<unknown>> = {
          synthese: () => getSynthese(base),
          bati: () => getBati(base),
          ventes: () => getVentes(base, a.rayon_m),
          energie: () => getEnergie(base),
          urbanisme: () => getUrbanisme(base),
          proprietaire: () => getProprietaire(base),
          risques: () => getRisques(base),
          loyers: () => getLoyers(base, {}),
          environnement: () => getEnvironnement(base, a.rayon_m),
          entreprise: () => getEntreprise(base),
        };
        const out: Record<string, unknown> = {
          parcelle: { idu: base.idu, adresse: base.address, commune: base.commune, surface_m2: base.contenance, mode: base.mode, lon: base.centroid[0], lat: base.centroid[1], carte: carte(ctx, base.idu), liens: base.links },
        };
        for (const s of [...new Set(a.sections)]) out[s] = await loaders[s]().catch((e) => ({ erreur: `section indisponible (${e instanceof Error ? e.message : "erreur"})` }));
        return trim(out);
      }),
  },
  {
    name: "etude_de_zone",
    title: "Étude de marché d'une commune ou d'une zone",
    description: "Étude de marché : transactions par type et par année (prix médians), ancienneté de détention, DPE, population, permis de construire, parc social. Pour une commune (insee) ou une emprise (bbox).",
    schema: z.object({ insee: z.string().regex(/^(\d{5}|2[AB]\d{3})$/).optional(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() }).strict(),
    readOnly: true,
    run: async (a: { insee?: string; bbox?: [number, number, number, number] }) => {
      if (a.insee) return trim(await buildEtude({ insee: a.insee }));
      if (a.bbox) {
        const [w, s, e, n] = a.bbox;
        return trim(await buildEtude({ polygon: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }));
      }
      return { erreur: "Précisez insee ou bbox." };
    },
  },
  {
    name: "crm_lister_leads",
    title: "CRM : lister les leads",
    description: "Liste les leads du CRM (parcelles suivies) avec leur étape, contact, score et tâches ouvertes.",
    schema: z.object({ etape: z.enum(STAGES).optional().describe("Filtrer par étape du pipeline") }).strict(),
    readOnly: true,
    run: async (a: { etape?: string }) => {
      const leads = (await listLeads()).filter((l) => !a.etape || l.stage === a.etape);
      return { total: leads.length, leads: trim(leads.slice(0, 100)) };
    },
  },
  {
    name: "crm_notes_du_lead",
    title: "CRM : notes d'un lead",
    description: "Notes enregistrées sur un lead.",
    schema: z.object({ lead_id: z.string().max(40) }).strict(),
    readOnly: true,
    run: async (a: { lead_id: string }) => ({ notes: trim(await listNotes(a.lead_id)) }),
  },
  {
    name: "crm_creer_lead",
    title: "CRM : ajouter une parcelle au CRM",
    description: "Ajoute une parcelle au CRM comme lead. À utiliser seulement à la demande de l'utilisateur.",
    schema: z.object({ idu: IDU, etape: z.enum(STAGES).default("a_prospecter"), titre: z.string().max(160).optional() }).strict(),
    readOnly: false,
    run: async (a: { idu: string; etape: string; titre?: string }) => {
      try {
        const existing = await leadByIdu(a.idu);
        if (existing) return { cree: false, lead: trim(existing) };
        const id = newId();
        await run("insert into crm_leads (id, idu, title, stage, assigned_to, created_by) values (?,?,?,?,?,?)", [id, a.idu, a.titre ?? null, a.etape, "acces@vigie", "claude"]);
        await logActivity("lead", `Claude a ajouté la parcelle ${a.idu} au CRM`, "claude", id);
        return { cree: true, lead: trim(await leadByIdu(a.idu)) };
      } catch (e) {
        return writeError(e);
      }
    },
  },
  {
    name: "crm_ajouter_note",
    title: "CRM : ajouter une note à un lead",
    description: "Ajoute une note à un lead existant. À utiliser seulement à la demande de l'utilisateur.",
    schema: z.object({ lead_id: z.string().max(40), note: z.string().trim().min(1).max(4000) }).strict(),
    readOnly: false,
    run: async (a: { lead_id: string; note: string }) => {
      try {
        await run("insert into crm_notes (id, lead_id, body, author) values (?,?,?,?)", [newId(), a.lead_id, a.note, "claude"]);
        await run("update crm_leads set updated_at = unixepoch() where id = ?", [a.lead_id]);
        await logActivity("note", `Claude a ajouté une note : ${a.note.slice(0, 80)}`, "claude", a.lead_id);
        return { ok: true };
      } catch (e) {
        return writeError(e);
      }
    },
  },
  {
    name: "crm_lister_taches",
    title: "CRM : lister les tâches",
    description: "Liste les tâches du CRM (à faire par défaut).",
    schema: z.object({ terminees: z.boolean().default(false), lead_id: z.string().max(40).optional() }).strict(),
    readOnly: true,
    run: async (a: { terminees: boolean; lead_id?: string }) => ({ taches: trim(await listTasks({ done: a.terminees, leadId: a.lead_id })) }),
  },
  {
    name: "crm_creer_tache",
    title: "CRM : créer une tâche",
    description: "Crée une tâche (relance, rendez-vous…) éventuellement liée à un lead. À utiliser seulement à la demande de l'utilisateur.",
    schema: z.object({ titre: z.string().trim().min(1).max(200), lead_id: z.string().max(40).optional(), echeance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-JJ") }).strict(),
    readOnly: false,
    run: async (a: { titre: string; lead_id?: string; echeance?: string }) => {
      try {
        await run("insert into crm_tasks (id, lead_id, title, due_at, assigned_to, created_by) values (?,?,?,?,?,?)", [newId(), a.lead_id ?? null, a.titre, a.echeance ?? null, "acces@vigie", "claude"]);
        await logActivity("task", `Claude a créé la tâche « ${a.titre} »`, "claude", a.lead_id ?? null);
        return { ok: true };
      } catch (e) {
        return writeError(e);
      }
    },
  },
];

function writeError(e: unknown) {
  if (isWriteBlocked(e)) return { erreur: "Écriture impossible : la base du CRM a atteint son quota (Turso). Lecture seule en attendant." };
  throw e;
}

const TOOLS_INDEX = [
  "chercher_adresse : adresse/commune → coordonnées et code INSEE",
  "rechercher_parcelles : parcelles d'une zone selon des filtres, triées par score",
  "fiche_parcelle : fiche complète d'une parcelle",
  "etude_de_zone : étude de marché d'une commune ou d'une emprise",
  "crm_* : lecture et écriture du CRM (leads, notes, tâches)",
];

export { ScopeTooWide };
