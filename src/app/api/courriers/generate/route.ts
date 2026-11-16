import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/server/api";
import { newId } from "@/lib/server/crm";
import { appQueryOne, query, run } from "@/lib/server/db";
import { buildLetters, getSettings, type ParcelOwnerRow } from "@/lib/server/letters";
import { renderLettersPdf } from "@/lib/server/letters-pdf";
import { searchParcels, searchSchema } from "@/lib/server/search";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({
  templateId: z.string().max(40),
  idus: z.array(z.string().regex(/^[0-9AB]{5}[0-9]{3}[0-9A-Z]{2}[0-9]{4}$/)).max(500).optional(),
  search: searchSchema.omit({ limit: true, offset: true }).optional(),
  format: z.enum(["pdf", "csv", "preview"]),
});

const COLS = "f.idu, f.adresse, f.insee, f.section, f.numero, f.contenance, f.lon, f.lat, f.is_pm, f.pm_siren, f.pm_denomination, f.pm_groupe";
const csvCell = (v: string) => (/[;"\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"` : v);

/** Génère les courriers (un par propriétaire, dédoublonnés, liste d'opposition respectée) : PDF, CSV de publipostage ou simple aperçu. */
export const POST = route({ body }, async ({ user, body }) => {
  const tpl = await appQueryOne<{ id: string; subject: string | null; body: string }>("select id, subject, body from letter_templates where id = ?", [body.templateId]);
  if (!tpl) return NextResponse.json({ error: "modèle introuvable" }, { status: 404 });

  let rows: ParcelOwnerRow[];
  if (body.idus?.length) {
    rows = await query<ParcelOwnerRow>(`select ${COLS} from parcelles f where f.idu in (${body.idus.map(() => "?").join(",")})`, body.idus);
  } else if (body.search) {
    const res = await searchParcels<ParcelOwnerRow>({ ...body.search, limit: 500, offset: 0 }, { columns: COLS, rawLimit: 500 });
    if (res.tooWide) return NextResponse.json({ error: "zone trop large" }, { status: 400 });
    rows = res.rows;
  } else return NextResponse.json({ error: "aucune sélection" }, { status: 400 });
  if (!rows.length) return NextResponse.json({ error: "aucun bien dans la sélection" }, { status: 400 });

  const settings = await getSettings();
  const { letters, excludedOpposition, duplicates } = await buildLetters(rows, tpl, settings);
  if (body.format === "preview") {
    return { selected: rows.length, letters: letters.length, excludedOpposition, duplicates, sample: letters[0] ? { destinataire: letters[0].recipient.destinataire, adresse: letters[0].recipient.ligneAdresse, subject: letters[0].subject, body: letters[0].body } : null };
  }
  if (!letters.length) return NextResponse.json({ error: "tous les destinataires sont exclus (opposition ou doublons)" }, { status: 400 });

  const batch = newId();
  for (const l of letters) {
    await run("insert into mail_history (id, batch_id, idu, template_id, recipient, address, kind, created_by) values (?,?,?,?,?,?,?,?)", [newId(), batch, l.recipient.idu, tpl.id, l.recipient.destinataire, l.recipient.ligneAdresse, body.format, user.email]);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "X-Letters": String(letters.length), "X-Excluded": String(excludedOpposition), "X-Duplicates": String(duplicates) };
  if (body.format === "pdf") {
    const pdf = await renderLettersPdf(letters.map((l) => ({ recipient: l.recipient, subject: l.subject, body: l.body, date: l.vars.date })), settings);
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="courriers-${stamp}.pdf"` } });
  }
  const head = ["destinataire", "adresse_destinataire", "societe", "adresse_bien", "reference_cadastrale", "commune", "surface_m2", "objet", "texte"];
  const lines = [head.join(";"), ...letters.map((l) => [l.recipient.destinataire, l.recipient.ligneAdresse, l.recipient.societe, l.recipient.adresseBien, l.recipient.reference, l.recipient.commune, l.recipient.surface, l.subject, l.body.replace(/\n/g, " ")].map(csvCell).join(";"))];
  return new Response("﻿" + lines.join("\r\n"), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="publipostage-${stamp}.csv"` } });
});
