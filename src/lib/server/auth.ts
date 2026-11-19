import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Accès par code unique (variable d'environnement ACCESS_CODE, jamais écrite dans le dépôt) : une fois le code saisi, un cookie de
 * session signé (JWT, 60 jours) est posé. Aucun compte, aucune base : l'identité est partagée (ACCESS_USER).
 */
export const SESSION_COOKIE = "vigie_session";
export const ACCESS_USER = "acces@vigie";
const SESSION_DAYS = 60;

const secretKey = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
};

/** Authentification désactivée uniquement en développement local si AUTH_SECRET est absent. */
export const authDisabled = () => !secretKey() && process.env.NODE_ENV !== "production";

export interface User {
  email: string;
  name: string | null;
  isAdmin: boolean;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Comparaison à temps constant du code saisi avec le code d'accès. */
export function accessCodeOk(code: string): boolean {
  const expected = (process.env.ACCESS_CODE ?? "").trim();
  if (!expected) return false; // sans ACCESS_CODE configuré, personne ne peut se connecter
  return timingSafeEqual(digest(code), digest(expected));
}

export async function signSession(email: string): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET manquant");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(email).setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(key);
}

export async function verifySessionToken(token: string): Promise<string | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.purpose) return null; // les jetons du connecteur Claude ne sont pas des sessions du site
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Jeton signé à usage précis (« purpose ») : connecteur Claude (client, code d'autorisation, accès, renouvellement). */
export async function signJwt(purpose: string, claims: Record<string, unknown>, ttl: string): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET manquant");
  return new SignJWT({ ...claims, purpose }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(key);
}

export async function verifyJwt(token: string, purpose: string): Promise<JWTPayload | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload.purpose === purpose ? payload : null;
  } catch {
    return null;
  }
}

export const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400 });

/** Utilisateur courant : toute session valide donne accès (identité partagée, sans base de données). */
export async function getUser(): Promise<User | null> {
  if (authDisabled()) return { email: "dev@local", name: "Développeur", isAdmin: true };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const email = await verifySessionToken(token);
  if (!email) return null;
  return { email, name: email === ACCESS_USER ? "Accès VIGIE" : null, isAdmin: true };
}

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) throw new Response(JSON.stringify({ error: "non authentifié" }), { status: 401, headers: { "Content-Type": "application/json" } });
  return u;
}

export async function requireAdmin(): Promise<User> {
  return requireUser();
}
