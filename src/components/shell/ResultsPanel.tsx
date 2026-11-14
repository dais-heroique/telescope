"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { BarChart3, Download, Loader2, Mail, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DpeChip } from "@/components/parcelle/ParcelDetail";
import { ClustersDialog } from "@/components/promoteurs/ClustersDialog";
import { MailDialog } from "@/components/courriers/MailDialog";
import { crm, useCrmMutation } from "@/components/crm/hooks";
import { EXPORT_COLUMNS } from "@/lib/export-columns";
import { fmtDate, fmtEur, fmtM2 } from "@/lib/parcelle/format";
import type { ListRow } from "@/lib/server/search";
import { SORT_LABELS, type SortKey } from "@/lib/server/search-types";
import { useUi } from "@/lib/store";

interface Res { rows: ListRow[]; total: number; truncated: boolean; tooWide: boolean }

/** Paramètres de recherche partagés par la liste et l'export (zone dessinée, sinon emprise de la carte). */
export function useSearchScope() {
  const { filters, zone, viewport, sort } = useUi();
  const bbox = viewport ? (viewport.bbox.map((v) => Math.round(v * 2000) / 2000) as [number, number, number, number]) : null;
  const scope = zone ? { polygon: zone } : bbox && (viewport?.zoom ?? 0) >= 13 ? { bbox } : null;
  return { scope, body: scope ? { filters, sort, ...scope } : null, zone, filters };
}

function ExportDialog({ body, onClose }: { body: Record<string, unknown>; onClose: () => void }) {
  const [cols, setCols] = useState<Set<string>>(new Set(EXPORT_COLUMNS.filter((c) => c.default).map((c) => c.key)));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function run(format: "csv" | "xlsx") {
    setBusy(format);
    setErr("");
    const r = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, format, columns: [...cols] }) });
    if (!r.ok) {
      setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Export impossible");
      setBusy(null);
      return;
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vigie-export.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBusy(null);
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border bg-popover p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Exporter la sélection">
        <h2 className="text-base font-semibold">Exporter la sélection</h2>
        <p className="mb-3 text-xs text-muted-foreground">Jusqu&apos;à 100 000 lignes. Aucune donnée nominative de particulier n&apos;est exportée.</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {EXPORT_COLUMNS.map((c) => (
            <label key={c.key} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={cols.has(c.key)} onChange={() => setCols((p) => { const n = new Set(p); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} /> {c.label}
            </label>
          ))}
        </div>
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="outline" disabled={!!busy || !cols.size} onClick={() => run("csv")}>{busy === "csv" ? <Loader2 className="animate-spin" /> : <Download />} CSV</Button>
          <Button disabled={!!busy || !cols.size} onClick={() => run("xlsx")}>{busy === "xlsx" ? <Loader2 className="animate-spin" /> : <Download />} Excel</Button>
        </div>
      </div>
    </div>
  );
}

/** Requête de recherche partagée (liste + compteur de l'onglet Filtres) : même clé → un seul appel réseau. */
export function useSearchResults() {
  const { body, scope, zone } = useSearchScope();
  const query = useQuery({
    queryKey: ["search", body],
    enabled: !!body,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, limit: 500, offset: 0 }) });
      if (!r.ok) throw new Error("recherche impossible");
      return (await r.json()) as Res;
    },
  });
  return { query, body, scope, zone };
}

export function ResultsPanel() {
  const { query: q, body, zone } = useSearchResults();
  const { sort, setSort, select, fly, module } = useUi();
  const [clusters, setClusters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mailing, setMailing] = useState(false);
  const saveSector = useCrmMutation((b: Record<string, unknown>) => crm.addSector(b));
  const parent = useRef<HTMLDivElement>(null);
  const rows = q.data?.rows ?? [];
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 74, overscan: 8 });

  if (!body) return <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">Zoomez sur la carte (niveau 13+) ou dessinez une zone (polygone, cercle, isochrone) pour lister les biens correspondant à vos filtres.</p>;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs">
          {q.isFetching ? <Loader2 className="inline size-3 animate-spin" /> : null}{" "}
          {q.data?.tooWide ? "Zone trop large" : <><strong>{q.data?.total ?? 0}</strong>{q.data?.truncated ? "+" : ""} bien(s){zone ? " dans la zone" : " dans la vue"}</>}
        </p>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setMailing(true)} disabled={!q.data?.total} title="Courriers aux propriétaires (500 max)"><Mail /> Courriers</Button>
          <Button size="sm" variant="outline" onClick={() => setExporting(true)} disabled={!q.data?.total}><Download /> Exporter</Button>
        </div>
      </div>
      {module === "promoteurs" && (
        <Button size="sm" variant="outline" onClick={() => setClusters(true)} disabled={!q.data?.total}><Merge /> Parcelles contiguës</Button>
      )}
      {zone && (
        <Button asChild size="sm" variant="ghost"><Link href="/etudes"><BarChart3 /> Étude de cette zone</Link></Button>
      )}
      {zone && (
        <Button size="sm" variant="ghost" onClick={() => { const name = prompt("Nom du secteur de prospection ?"); if (name?.trim()) saveSector.mutate({ name: name.trim(), polygon: zone }); }}>Enregistrer cette zone comme secteur</Button>
      )}
      <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 rounded-md border bg-card px-2 text-xs" aria-label="Trier par">
        {Object.entries(SORT_LABELS).map(([k, l]) => <option key={k} value={k}>Tri : {l}</option>)}
      </select>
      {q.error && <p className="text-sm text-destructive">Erreur de recherche.</p>}
      <div ref={parent} className="min-h-0 flex-1 overflow-y-auto" data-testid="results-list">
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((v) => {
            const r = rows[v.index];
            return (
              <button
                key={r.idu}
                onClick={() => { select({ idu: r.idu, section: r.section, numero: r.numero, contenance: r.contenance ?? undefined, codeInsee: r.insee }); fly(r.lon, r.lat, 18); }}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: v.size, transform: `translateY(${v.start}px)` }}
                className="flex flex-col justify-center gap-0.5 border-b px-1 text-left hover:bg-accent"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{r.adresse ?? `${r.insee} · ${r.section} ${r.numero}`}</span>
                  {r.score !== null && <span className="shrink-0 rounded px-1.5 text-xs font-bold text-white" style={{ background: r.score >= 70 ? "#c1121f" : r.score >= 40 ? "#e07a1f" : "#6b8e5a" }}>{r.score}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>{fmtM2(r.contenance)}</span>
                  {r.usage_principal && <span>{r.usage_principal}</span>}
                  {r.dpe_latest && <DpeChip label={r.dpe_latest} />}
                  {r.last_sale_date && <span>{fmtDate(r.last_sale_date)} · {fmtEur(r.last_sale_price)}</span>}
                </span>
                <span className="flex flex-wrap gap-1 text-[10px]">
                  {r.is_pm ? <span className="rounded bg-secondary px-1">{r.pm_denomination ?? "personne morale"}</span> : null}
                  {r.is_passoire ? <span className="rounded bg-red-100 px-1 text-red-800">passoire</span> : null}
                  {r.is_monopropriete ? <span className="rounded bg-amber-100 px-1 text-amber-900">monopropriété</span> : null}
                  {r.is_divisible ? <span className="rounded bg-amber-100 px-1 text-amber-900">divisible</span> : null}
                  {r.is_dent_creuse ? <span className="rounded bg-amber-100 px-1 text-amber-900">dent creuse</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {clusters && body && <ClustersDialog body={body} onClose={() => setClusters(false)} />}
      {mailing && body && <MailDialog scope={{ search: body }} onClose={() => setMailing(false)} />}
      {exporting && body && <ExportDialog body={body} onClose={() => setExporting(false)} />}
    </div>
  );
}
