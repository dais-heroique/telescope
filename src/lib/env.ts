/** Variables d'environnement côté serveur (aucune valeur par défaut dangereuse). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function enabledDepartments(): string[] {
  return (process.env.ENABLED_DEPARTMENTS ?? "74").split(",").map((d) => d.trim()).filter(Boolean);
}
