import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { adminEmails, SITE_URL } from "@/lib/env";
import { query, queryOne, run } from "./db";

export const SESSION_COOKIE = "vigie_session";
const SESSION_DAYS = 60;
const TOKEN_MINUTES = 20;

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

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

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
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400 });

/** Utilisateur courant (vérifié en base : un utilisateur supprimé perd l'accès immédiatement). */
export async function getUser(): Promise<User | null> {
  if (authDisabled()) return { email: "dev@local", name: "Développeur", isAdmin: true };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const email = await verifySessionToken(token);
  if (!email) return null;
  let u: { email: string; name: string | null; is_admin: number } | null = null;
  try {
    u = await queryOne<{ email: string; name: string | null; is_admin: number }>("select email, name, is_admin from users where email = ?", [email]);
  } catch (e) {
    console.error("[auth] lecture utilisateur", e instanceof Error ? e.message : e);
    if (adminEmails().includes(email)) return { email, name: null, isAdmin: true };
    return null;
  }
  if (!u) return null;
  return { email: u.email, name: u.name, isAdmin: Boolean(u.is_admin) || adminEmails().includes(u.email) };
}

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) throw new Response(JSON.stringify({ error: "non authentifié" }), { status: 401, headers: { "Content-Type": "application/json" } });
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (!u.isAdmin) throw new Response(JSON.stringify({ error: "réservé aux administrateurs" }), { status: 403, headers: { "Content-Type": "application/json" } });
  return u;
}

/** Les administrateurs déclarés dans ADMIN_EMAILS sont créés à la première demande de lien. */
export async function isAllowedEmail(email: string): Promise<boolean> {
  if (adminEmails().includes(email)) {
    try {
      await run("insert into users (email, is_admin) values (?, 1) on conflict (email) do update set is_admin = 1", [email]);
    } catch (e) {
      // base en lecture seule (quota) : un administrateur déclaré reste autorisé
      console.warn("[auth] upsert admin impossible :", e instanceof Error ? e.message : e);
    }
    return true;
  }
  return Boolean(await queryOne("select 1 x from users where email = ?", [email]));
}

/** Lien de connexion (20 min) : jeton signé sans état — aucune écriture en base nécessaire. */
export async function createLoginLink(email: string): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET manquant");
  const token = await new SignJWT({ purpose: "login", n: randomBytes(8).toString("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MINUTES}m`)
    .sign(key);
  return `${SITE_URL}/auth/verify?token=${token}`;
}

/** Vérifie un jeton de connexion ; renvoie l'email si valide. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  const key = secretKey();
  if (!key) return null;
  let email: string;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.purpose !== "login" || typeof payload.sub !== "string") return null;
    email = payload.sub;
  } catch {
    return null;
  }
  try {
    await run("update users set last_login_at = unixepoch() where email = ?", [email]);
  } catch {
    /* non bloquant */
  }
  return email;
}

export async function sendLoginEmail(email: string, link: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "VIGIE <onboarding@resend.dev>",
      to: [email],
      subject: "Votre lien de connexion VIGIE",
      html: `<p>Bonjour,</p><p><a href="${link}">Se connecter à VIGIE</a> (lien valable ${TOKEN_MINUTES} minutes, usage unique).</p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    }),
  });
  return res.ok;
}

export async function listUsers() {
  return query<{ email: string; name: string | null; is_admin: number; created_at: number; last_login_at: number | null }>("select * from users order by created_at");
}
