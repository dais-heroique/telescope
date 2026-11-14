/** Rendu de modèles de courriers : variables {{nom}} (pur, testé). */
export const LETTER_VARIABLES: { key: string; label: string }[] = [
  { key: "destinataire", label: "Destinataire (nom ou « Au propriétaire »)" },
  { key: "societe", label: "Nom de la société propriétaire (vide pour un particulier)" },
  { key: "adresse_bien", label: "Adresse du bien" },
  { key: "reference_cadastrale", label: "Références cadastrales (ex. 74010 000 AB 0123)" },
  { key: "commune", label: "Commune" },
  { key: "surface", label: "Surface de la parcelle (m²)" },
  { key: "agent", label: "Nom de l'agent (signature)" },
  { key: "agence", label: "Nom de l'agence" },
  { key: "signature", label: "Bloc de signature complet" },
  { key: "date", label: "Date du jour" },
];

export type LetterVars = Record<string, string>;

/** Remplace {{variable}} ; une variable inconnue est laissée visible (« {{x}} ») pour être repérée à l'aperçu. */
export function renderTemplate(text: string, vars: LetterVars): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

/** Paragraphes séparés par une ligne vide ; les retours à la ligne simples sont conservés. */
export function toParagraphs(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/** Clé normalisée d'une adresse pour la liste d'opposition et la déduplication. */
export function addressKey(address: string): string {
  return address.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const DEFAULT_TEMPLATE = {
  name: "Prospection propriétaire",
  subject: "Votre bien situé {{adresse_bien}}",
  body: `{{destinataire}},

Je me permets de vous écrire au sujet de votre bien situé {{adresse_bien}} ({{commune}}, parcelle {{reference_cadastrale}}).

Je suis {{agent}}, de {{agence}}. Je connais bien ce secteur et je reçois régulièrement des demandes d'acquéreurs à la recherche d'un bien comme le vôtre.

Si vous envisagez de vendre, ou si vous souhaitez simplement connaître la valeur actuelle de votre bien, je vous propose une estimation gratuite et sans engagement.

Dans l'attente de votre retour, je vous prie d'agréer mes salutations distinguées.

{{signature}}`,
};
