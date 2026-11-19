import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { accessCodeOk, ACCESS_USER, signJwt, verifyJwt } from "../auth";

/**
 * OAuth 2.1 sans état pour le connecteur Claude (MCP) : aucune base de données, tout est dans des jetons signés (AUTH_SECRET).
 *  - le client (Claude) s'enregistre dynamiquement : son client_id est un jeton signé contenant ses adresses de retour ;
 *  - la personne saisit le code d'accès de VIGIE sur la page d'autorisation → code d'autorisation signé (5 min, PKCE S256) ;
 *  - échange code → jeton d'accès (7 jours) + jeton de renouvellement (180 jours).
 */
const SCOPE = "vigie";
const ACCESS_TTL_S = 7 * 24 * 3600;

export function originOf(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const validRedirect = (u: string) => {
  try {
    const x = new URL(u);
    if (u.length > 500) return false;
    if (x.protocol === "https:") return true;
    return x.protocol === "http:" && (x.hostname === "localhost" || x.hostname === "127.0.0.1");
  } catch {
    return false;
  }
};

/** Enregistrement dynamique du client (RFC 7591) : le client_id est un jeton signé, rien n'est stocké. */
export async function registerClient(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) return { error: "invalid_redirect_uri" as const };
  const name = typeof b.client_name === "string" ? b.client_name.slice(0, 80) : "Claude";
  const client_id = await signJwt("mcp-client", { ru: uris, nm: name }, "3650d");
  return {
    client_id,
    client_name: name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}

// Limite des essais de code d'accès (par instance serveur) : 8 erreurs par 10 minutes et par adresse IP.
const fails = new Map<string, { n: number; reset: number }>();

export interface AuthorizeInput {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  code?: string;
}

/** Vérifie la demande d'autorisation et le code d'accès saisi ; renvoie l'adresse de retour (avec le code d'autorisation) ou une erreur. */
export async function authorize(input: AuthorizeInput, ip: string): Promise<{ redirectTo: string } | { error: string; status: number }> {
  const client = input.client_id ? await verifyJwt(input.client_id, "mcp-client") : null;
  const ru = (client?.ru as string[] | undefined) ?? [];
  if (!client || !input.redirect_uri || !ru.includes(input.redirect_uri)) return { error: "Demande d'autorisation invalide (client inconnu).", status: 400 };
  if (input.response_type !== "code" || !input.code_challenge || input.code_challenge_method !== "S256") return { error: "Demande d'autorisation invalide (PKCE S256 requis).", status: 400 };

  const now = Date.now();
  const f = fails.get(ip);
  if (f && f.reset > now && f.n >= 8) return { error: "Trop d'essais, réessayez dans quelques minutes.", status: 429 };
  if (!input.code || !accessCodeOk(input.code.trim())) {
    fails.set(ip, f && f.reset > now ? { n: f.n + 1, reset: f.reset } : { n: 1, reset: now + 10 * 60_000 });
    await new Promise((r) => setTimeout(r, 500));
    return { error: "Code d'accès incorrect.", status: 401 };
  }
  fails.delete(ip);

  const code = await signJwt("mcp-code", { cid: input.client_id, ru: input.redirect_uri, cc: input.code_challenge }, "5m");
  const url = new URL(input.redirect_uri);
  url.searchParams.set("code", code);
  if (input.state) url.searchParams.set("state", input.state);
  return { redirectTo: url.toString() };
}

const b64url = (buf: Buffer) => buf.toString("base64url");

async function issueTokens(clientId: string) {
  const [access_token, refresh_token] = await Promise.all([
    signJwt("mcp-access", { sub: ACCESS_USER, cid: clientId }, `${ACCESS_TTL_S}s`),
    signJwt("mcp-refresh", { sub: ACCESS_USER, cid: clientId }, "180d"),
  ]);
  return { access_token, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token, scope: SCOPE };
}

/** Point d'échange des jetons (RFC 6749 §4.1.3 et §6) : code + PKCE → jetons, ou renouvellement. */
export async function token(params: Record<string, string>): Promise<{ body: Record<string, unknown>; status: number }> {
  const err = (error: string, status = 400) => ({ body: { error }, status });
  if (params.grant_type === "authorization_code") {
    const code = params.code ? await verifyJwt(params.code, "mcp-code") : null;
    if (!code) return err("invalid_grant");
    if (code.ru !== params.redirect_uri) return err("invalid_grant");
    if (params.client_id && params.client_id !== code.cid) return err("invalid_client", 401);
    const verifier = params.code_verifier ?? "";
    if (!verifier || b64url(createHash("sha256").update(verifier).digest()) !== code.cc) return err("invalid_grant");
    return { body: await issueTokens(String(code.cid)), status: 200 };
  }
  if (params.grant_type === "refresh_token") {
    const r = params.refresh_token ? await verifyJwt(params.refresh_token, "mcp-refresh") : null;
    if (!r) return err("invalid_grant");
    return { body: await issueTokens(String(r.cid)), status: 200 };
  }
  return err("unsupported_grant_type");
}

/** Jeton d'accès présenté par Claude sur /api/mcp. */
export async function bearerOk(req: NextRequest): Promise<boolean> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m && (await verifyJwt(m[1]!, "mcp-access")));
}

export const authServerMetadata = (origin: string) => ({
  issuer: origin,
  authorization_endpoint: `${origin}/oauth/authorize`,
  token_endpoint: `${origin}/api/oauth/token`,
  registration_endpoint: `${origin}/api/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: [SCOPE],
});

export const resourceMetadata = (origin: string) => ({
  resource: `${origin}/api/mcp`,
  authorization_servers: [origin],
  bearer_methods_supported: ["header"],
  scopes_supported: [SCOPE],
  resource_name: "VIGIE",
});
