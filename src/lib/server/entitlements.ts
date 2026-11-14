import { enabledDepartments } from "@/lib/env";

export interface Entitlement {
  /** Départements importés accessibles à l'utilisateur. */
  departments: string[];
  /** Les tuiles dépendent de l'utilisateur → cache navigateur seulement (pas de cache CDN partagé). */
  restricted: boolean;
}

/**
 * Droits d'accès aux données importées. Étape 4 : tous les départements activés (mode démo / sans abonnement).
 * Étape 12 : filtre par les départements du plan Stripe de l'organisation (voir lib/server/billing).
 */
export async function getEntitlement(): Promise<Entitlement> {
  return { departments: enabledDepartments(), restricted: false };
}
