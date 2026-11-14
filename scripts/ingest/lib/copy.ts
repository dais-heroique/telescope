import { parse } from "csv-parse";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Sql } from "./db";

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const cell = (v: string | undefined) => (v === undefined || v === "" ? "" : `"${v.replace(/"/g, '""')}"`);

export interface CopyOptions {
  delimiter?: string;
  /** Colonnes à conserver (par défaut : toutes). */
  select?: string[];
  /** Filtre de lignes appliqué avant l'écriture. */
  filter?: (row: Record<string, string>) => boolean;
  encoding?: BufferEncoding;
  /** Ajoute à une table de staging existante (mêmes colonnes) au lieu de la recréer. */
  append?: boolean;
}

/**
 * Charge un flux CSV dans une table de staging « tout en texte » via COPY.
 * Table UNLOGGED recréée à chaque appel ; colonnes déduites de l'en-tête (ou `select`).
 * Retourne le nombre de lignes conservées.
 */
export async function copyCsvToStaging(sql: Sql, table: string, input: Readable, opts: CopyOptions = {}): Promise<number> {
  const parser = input.pipe(
    parse({
      delimiter: opts.delimiter ?? ",",
      columns: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      encoding: opts.encoding ?? "utf8",
    }),
  );
  const it = (parser as AsyncIterable<Record<string, string>>)[Symbol.asyncIterator]();
  const first = await it.next();
  const cols = opts.select ?? (first.done ? [] : Object.keys(first.value));

  if (!opts.append) {
    await sql.unsafe(`drop table if exists ${ident(table)}`);
    await sql.unsafe(`create unlogged table ${ident(table)} (${cols.length ? cols.map((c) => `${ident(c)} text`).join(", ") : "empty text"})`);
  }
  if (first.done || cols.length === 0) return 0;

  let kept = 0;
  async function* lines() {
    let buf: string[] = [];
    let size = 0;
    const rest: AsyncIterable<Record<string, string>> = { [Symbol.asyncIterator]: () => it };
    const emit = (row: Record<string, string>) => {
      if (opts.filter && !opts.filter(row)) return null;
      kept++;
      return cols.map((c) => cell(row[c])).join(",") + "\n";
    };
    const l0 = emit(first.value as Record<string, string>);
    if (l0) {
      buf.push(l0);
      size += l0.length;
    }
    for await (const row of rest) {
      const l = emit(row);
      if (!l) continue;
      buf.push(l);
      size += l.length;
      if (size > 1 << 16) {
        yield buf.join("");
        buf = [];
        size = 0;
      }
    }
    if (buf.length) yield buf.join("");
  }

  const writable = await sql.unsafe(`copy ${ident(table)} (${cols.map(ident).join(", ")}) from stdin with (format csv)`).writable();
  await pipeline(Readable.from(lines()), writable);
  return kept;
}
