import { addressKey, renderTemplate, type LetterVars } from "@/lib/mail/render";
import { cached, fetchJson, soft } from "./cache";
import { appQuery, appQueryOne, run } from "./db";

export interface AgencySettings {
  agence: string;
  agent: string;
  signature: string;
  logo: string | null; // data URL (≤ 300 Ko)
  expediteur: string;
}
const EMPTY: AgencySettings = { agence: "", agent: "", signature: "", logo: null, expediteur: "" };

export async function getSettings(): Promise<AgencySettings> {
  const r = await appQueryOne<{ value: string }>("select value from settings where key = 'agency'");
  return r ? { ...EMPTY, ...JSON.parse(r.value) } : EMPTY;
}
export async function saveSettings(s: AgencySettings) {
  await run("insert into settings (key, value) values ('agency', ?) on conflict (key) do update set value = excluded.value", [JSON.stringify(s)]);
}

export interface ParcelOwnerRow {
  idu: string; adresse: string | null; insee: string; section: string; numero: string; contenance: number | null; lon: number; lat: number;
  is_pm: number; pm_siren: string | null; pm_denomination: string | null; pm_groupe: string | null;
}

export interface Recipient {
  idu: string;
  destinataire: string;
  societe: string;
  ligneAdresse: string; // adresse postale du destinataire
  adresseBien: string;
  commune: string;
  reference: string;
  surface: string;
  key: string;
}

const POSTCODE = /\b\d{5}\b/;

/** Adresse postale complète d'un bien : BAN inverse au besoin (les adresses DVF n'ont ni code postal ni commune). */
async function fullAddress(r: ParcelOwnerRow): Promise<{ label: string; commune: string }> {
  if (r.adresse && POSTCODE.test(r.adresse)) {
    const m = r.adresse.match(/\b\d{5}\s+(.+)$/);
    return { label: r.adresse, commune: m?.[1] ?? "" };
  }
  const rev = await soft(
    cached(`ban:reverse:${r.lon.toFixed(5)},${r.lat.toFixed(5)}`, 30 * 86400, async () => {
      const j = await fetchJson<{ features: { properties: { label: string; city: string } }[] }>(`https://data.geopf.fr/geocodage/reverse?lon=${r.lon}&lat=${r.lat}&index=address&limit=1`);
      const p = j.features[0]?.properties;
      return { label: p?.label ?? null, city: p?.city ?? null };
    }),
  );
  const street = r.adresse ? r.adresse.replace(/\s+/g, " ").trim() : null;
  if (street && rev?.city) return { label: `${street}, ${rev.city}`, commune: rev.city };
  return { label: rev?.label ?? street ?? `parcelle ${r.section} ${r.numero}`, commune: rev?.city ?? "" };
}

async function companyAddress(siren: string): Promise<string | null> {
  const j = await soft(cached(`entreprise:${siren}`, 7 * 86400, () => fetchJson<{ results: { siren: string; siege: { adresse: string | null } }[] }>(`https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`)));
  return j?.results.find((x) => x.siren === siren)?.siege?.adresse ?? null;
}

/** Concurrence limitée (APIs publiques : ~7 req/s). */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

/**
 * Destinataire d'une parcelle :
 *  - personne morale privée → « À l'attention du représentant légal de X », adresse du siège
 *  - sinon → « Au propriétaire », adresse du bien (aucune donnée nominative de particulier)
 */
export async function resolveRecipients(rows: ParcelOwnerRow[]): Promise<Recipient[]> {
  return mapLimit(rows, 6, async (r) => {
    const addr = await fullAddress(r);
    const priv = r.is_pm === 1 && r.pm_siren && r.pm_groupe === "personnes morales non remarquables";
    const siege = priv ? await companyAddress(r.pm_siren!) : null;
    const destinataire = priv ? `À l'attention du représentant légal de ${r.pm_denomination ?? r.pm_siren}` : "Au propriétaire";
    const ligneAdresse = priv && siege ? siege : addr.label;
    return {
      idu: r.idu,
      destinataire,
      societe: priv ? (r.pm_denomination ?? "") : "",
      ligneAdresse,
      adresseBien: addr.label,
      commune: addr.commune,
      reference: `${r.insee} ${r.idu.slice(5, 8)} ${r.section} ${r.numero}`,
      surface: r.contenance ? String(r.contenance) : "",
      key: addressKey(`${destinataire} ${ligneAdresse}`),
    };
  });
}

export async function oppositionKeys(): Promise<Set<string>> {
  return new Set((await appQuery<{ key: string }>("select key from opposition")).map((r) => r.key));
}

export function varsFor(r: Recipient, s: AgencySettings, date = new Date()): LetterVars {
  const signature = s.signature || [s.agent, s.agence].filter(Boolean).join("\n");
  return {
    destinataire: r.destinataire, societe: r.societe, adresse_bien: r.adresseBien, reference_cadastrale: r.reference, commune: r.commune, surface: r.surface,
    agent: s.agent, agence: s.agence, signature, date: date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
  };
}

export interface BuiltLetter { recipient: Recipient; subject: string; paragraphs: string[]; vars: LetterVars }

/** Déduplique par destinataire+adresse, écarte la liste d'opposition (adresse du bien OU adresse du destinataire). */
export async function buildLetters(rows: ParcelOwnerRow[], tpl: { subject: string | null; body: string }, s: AgencySettings) {
  const recipients = await resolveRecipients(rows);
  const opposed = await oppositionKeys();
  const seen = new Set<string>();
  const letters: { recipient: Recipient; vars: LetterVars; subject: string; body: string }[] = [];
  let excludedOpposition = 0;
  let duplicates = 0;
  for (const r of recipients) {
    if (opposed.has(addressKey(r.adresseBien)) || opposed.has(addressKey(r.ligneAdresse))) { excludedOpposition++; continue; }
    if (seen.has(r.key)) { duplicates++; continue; }
    seen.add(r.key);
    const vars = varsFor(r, s);
    letters.push({ recipient: r, vars, subject: renderTemplate(tpl.subject ?? "", vars), body: renderTemplate(tpl.body, vars) });
  }
  return { letters, excludedOpposition, duplicates };
}
