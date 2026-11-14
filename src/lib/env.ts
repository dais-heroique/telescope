import { z } from "zod";

/** Variables publiques (disponibles côté navigateur). */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
});

/** Supabase est-il configuré ? Permet de faire tourner l'UI en mode démo sans backend. */
export const hasSupabase = Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Variables serveur uniquement : à n'appeler que dans du code serveur. */
export function serverEnv() {
  return z
    .object({
      DATABASE_URL: z.string().optional(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
      ENABLED_DEPARTMENTS: z.string().default("74"),
      STRIPE_SECRET_KEY: z.string().optional(),
      STRIPE_WEBHOOK_SECRET: z.string().optional(),
      RESEND_API_KEY: z.string().optional(),
      LISTINGS_PROVIDER: z.enum(["", "moteurimmo", "streamestate"]).default(""),
      MAIL_PROVIDER: z.enum(["", "merci-facteur"]).default(""),
    })
    .parse({
      DATABASE_URL: process.env.DATABASE_URL || undefined,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
      ENABLED_DEPARTMENTS: process.env.ENABLED_DEPARTMENTS || undefined,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,
      RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
      LISTINGS_PROVIDER: process.env.LISTINGS_PROVIDER || "",
      MAIL_PROVIDER: process.env.MAIL_PROVIDER || "",
    });
}

export function enabledDepartments(): string[] {
  return serverEnv()
    .ENABLED_DEPARTMENTS.split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}
