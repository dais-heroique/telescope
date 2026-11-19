import { z } from "zod";
import { ScopeBusy, ScopeTooWide } from "../shards";
import { TOOLS, type Ctx } from "./tools";

/**
 * Serveur MCP (Model Context Protocol) « Streamable HTTP » sans état : chaque requête POST porte un message JSON-RPC (ou un lot)
 * et reçoit la réponse en JSON. Suffisant pour les outils (pas de notifications serveur → client).
 */
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_TEXT = 60_000;

const INSTRUCTIONS = `VIGIE est un outil de prospection immobilière en France fondé sur des données publiques (cadastre, DVF, DPE, PLU, permis…).
Démarche conseillée : 1) couverture_donnees si besoin de contexte ; 2) chercher_adresse pour situer une commune ou une adresse ; 3) rechercher_parcelles sur une zone avec des filtres ; 4) fiche_parcelle pour creuser une parcelle ; 5) etude_de_zone pour le marché local.
Le score (0-100) est une estimation de probabilité de vente expliquée par des facteurs : présentez-le comme une piste, pas une certitude.
Les outils crm_creer_lead, crm_ajouter_note et crm_creer_tache modifient le CRM : ne les utilisez que si l'utilisateur le demande explicitement.
Les noms de propriétaires ne concernent que des personnes morales (sociétés). Fournissez toujours les liens « carte » pour que l'utilisateur voie la parcelle.`;

const rpc = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number()]).optional(), method: z.string(), params: z.record(z.string(), z.unknown()).optional() });

type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };
const ok = (id: string | number, result: unknown): Reply => ({ jsonrpc: "2.0", id, result });
const fail = (id: string | number | null, code: number, message: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message } });

function toolList() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: schema,
      annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly, openWorldHint: true },
    };
  });
}

async function callTool(name: string, args: unknown, ctx: Ctx) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { isError: true, content: [{ type: "text", text: `Outil inconnu : ${name}` }] };
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    return { isError: true, content: [{ type: "text", text: `Paramètres invalides : ${parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`).join(" ; ")}` }] };
  }
  try {
    const result = await tool.run(parsed.data as never, ctx);
    let text = JSON.stringify(result);
    if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + `… [réponse tronquée à ${MAX_TEXT} caractères : affinez la demande]`;
    return { content: [{ type: "text", text }], isError: false };
  } catch (e) {
    const msg = e instanceof ScopeTooWide ? "Zone trop large : réduisez la zone." : e instanceof ScopeBusy ? "Données momentanément saturées, réessayez dans un instant." : "Erreur interne lors de l'exécution de l'outil.";
    if (!(e instanceof ScopeTooWide || e instanceof ScopeBusy)) console.error("[mcp] outil", name, e instanceof Error ? e.message : e);
    return { isError: true, content: [{ type: "text", text: msg }] };
  }
}

/** Traite un message JSON-RPC ; `null` pour une notification (aucune réponse attendue). */
export async function handleMessage(raw: unknown, ctx: Ctx): Promise<Reply | null> {
  const m = rpc.safeParse(raw);
  if (!m.success) return fail(null, -32600, "Requête JSON-RPC invalide");
  const { id, method, params } = m.data;
  if (id === undefined) return null; // notification (notifications/initialized, etc.)
  switch (method) {
    case "initialize": {
      const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "vigie", title: "VIGIE — prospection immobilière", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: toolList() });
    case "tools/call":
      return ok(id, await callTool(String(params?.name ?? ""), params?.arguments, ctx));
    case "resources/list":
      return ok(id, { resources: [] });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return fail(id, -32601, `Méthode non prise en charge : ${method}`);
  }
}
