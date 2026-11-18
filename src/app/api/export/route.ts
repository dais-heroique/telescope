import ExcelJS from "exceljs";
import { ScopeBusy } from "@/lib/server/shards";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { BOOL_KEYS } from "@/lib/export-columns";
import { exportSelect, searchParcels, searchSchema } from "@/lib/server/search";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = searchSchema.omit({ limit: true, offset: true }).extend({
  format: z.enum(["csv", "xlsx"]),
  columns: z.array(z.string().max(30)).max(40).default([]),
});

const MAX_ROWS = 100_000;
const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // protection contre l'injection de formules (CSV/Excel)
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Export illimité (plafonné à 100 000 lignes) de la sélection : zone dessinée ou emprise de la carte + filtres. */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "paramètres invalides" }, { status: 400 });
  const { format, columns, ...search } = parsed.data;
  const { sql, cols } = exportSelect(columns);
  try {
    const res = await searchParcels<Record<string, unknown>>({ ...search, limit: 500, offset: 0 }, { columns: sql, rawLimit: MAX_ROWS });
    if (res.tooWide) return NextResponse.json({ error: "zone trop large : zoomez ou dessinez une zone" }, { status: 400 });
    const fmt = (c: { key: string }, v: unknown) => (BOOL_KEYS.has(c.key) ? (v ? "oui" : "non") : v);
    const name = `vigie-export-${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") {
      const lines = [cols.map((c) => csvCell(c.label)).join(";"), ...res.rows.map((r) => cols.map((c) => csvCell(fmt(c, r[c.key]))).join(";"))];
      return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "X-Rows": String(res.rows.length) } });
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("VIGIE");
    ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, Math.min(40, c.label.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const r of res.rows) ws.addRow(Object.fromEntries(cols.map((c) => [c.key, ((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v))(fmt(c, r[c.key]))])));
    const buf = await wb.xlsx.writeBuffer();
    return new Response(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"`, "X-Rows": String(res.rows.length) } });
  } catch (e) {
    if (e instanceof ScopeBusy) return NextResponse.json({ error: "Données momentanément saturées, réessayez dans un instant." }, { status: 503, headers: { "Retry-After": "2" } });
    console.error("export", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "erreur serveur" }, { status: 500 });
  }
}
