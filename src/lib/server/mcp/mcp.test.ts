import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { authorize, registerClient, token } from "./oauth";
import { handleMessage } from "./server";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret";
  process.env.ACCESS_CODE = "4242";
});

const redirect = "https://claude.ai/api/mcp/auth_callback";
const challenge = (v: string) => createHash("sha256").update(v).digest("base64url");

describe("OAuth du connecteur Claude", () => {
  it("enregistre un client et refuse les adresses de retour non sécurisées", async () => {
    expect("client_id" in (await registerClient({ redirect_uris: [redirect] }))).toBe(true);
    expect(await registerClient({ redirect_uris: ["http://evil.example/cb"] })).toEqual({ error: "invalid_redirect_uri" });
    expect(await registerClient({})).toEqual({ error: "invalid_redirect_uri" });
  });

  it("autorise avec le bon code d'accès, puis échange le code contre des jetons (PKCE)", async () => {
    const c = (await registerClient({ redirect_uris: [redirect] })) as { client_id: string };
    const verifier = "v".repeat(48);
    const base = { client_id: c.client_id, redirect_uri: redirect, response_type: "code", code_challenge: challenge(verifier), code_challenge_method: "S256", state: "s1" };
    expect(await authorize({ ...base, code: "0000" }, "ip-test")).toMatchObject({ status: 401 });
    expect(await authorize({ ...base, code: "4242", redirect_uri: "https://autre.example/cb" }, "ip-test")).toMatchObject({ status: 400 });
    const ok = await authorize({ ...base, code: "4242" }, "ip-test");
    expect("redirectTo" in ok).toBe(true);
    const code = new URL((ok as { redirectTo: string }).redirectTo).searchParams.get("code")!;
    const bad = await token({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: c.client_id, code_verifier: "autre" });
    expect(bad.status).toBe(400);
    const good = await token({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: c.client_id, code_verifier: verifier });
    expect(good.status).toBe(200);
    const refreshed = await token({ grant_type: "refresh_token", refresh_token: String(good.body.refresh_token) });
    expect(refreshed.status).toBe(200);
    expect((await token({ grant_type: "refresh_token", refresh_token: String(good.body.access_token) })).status).toBe(400);
  });
});

describe("serveur MCP", () => {
  const ctx = { origin: "https://vigie.test" };
  it("répond à initialize en négociant la version du protocole", async () => {
    const r = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, ctx);
    expect(r?.result).toMatchObject({ protocolVersion: "2025-03-26", serverInfo: { name: "vigie" } });
    const r2 = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, ctx);
    expect(r2?.result).toMatchObject({ protocolVersion: "2025-06-18" });
  });
  it("ne répond pas aux notifications", async () => {
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull();
  });
  it("liste des outils avec des schémas d'entrée de type objet, et seuls les outils d'écriture du CRM ne sont pas en lecture seule", async () => {
    const r = await handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, ctx);
    const tools = (r?.result as { tools: { name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(tools.length).toBeGreaterThanOrEqual(10);
    expect(tools.every((t) => t.inputSchema.type === "object")).toBe(true);
    expect(tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name).sort()).toEqual(["crm_ajouter_note", "crm_creer_lead", "crm_creer_tache"]);
  });
  it("signale proprement paramètres invalides, outil inconnu et méthode inconnue", async () => {
    const bad = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "rechercher_parcelles", arguments: { insee: "xx" } } }, ctx);
    expect(bad?.result).toMatchObject({ isError: true });
    const unknown = await handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } }, ctx);
    expect(unknown?.result).toMatchObject({ isError: true });
    const m = await handleMessage({ jsonrpc: "2.0", id: 6, method: "foo/bar" }, ctx);
    expect(m?.error?.code).toBe(-32601);
    expect((await handleMessage({ nope: true }, ctx))?.error?.code).toBe(-32600);
  });
});
