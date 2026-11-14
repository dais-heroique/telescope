/** `libsql://` (WebSocket) → `https://` : requêtes HTTP sans état, adaptées aux fonctions serverless. */
export function normalizeLibsqlUrl(url: string | undefined): string {
  if (!url) return "file:.data/vigie.db";
  return url.startsWith("libsql://") ? "https://" + url.slice("libsql://".length) : url;
}
