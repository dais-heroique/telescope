"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Etude } from "@/lib/etude-types";
import { useUi } from "@/lib/store";
import type { GeocodeHit } from "@/app/api/geocode/route";

type Scope = { insee: string; label: string } | { polygon: GeoJSON.Polygon; label: string };
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("fr-FR"));

function Bars({ rows }: { rows: { label: string; v: number; text: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0">{r.label}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded bg-muted"><span className="block h-full bg-beacon" style={{ width: `${(r.v / max) * 100}%` }} /></span>
          <span className="w-36 shrink-0 text-right text-muted-foreground">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Report({ e }: { e: Etude }) {
  const price = (k: "maison" | "appartement") => e.transactions.byYear.map((y) => ({ label: String(y.year), v: y[k].median ?? 0, text: y[k].median ? `${n(y[k].median)} €/m² · ${y[k].n} ventes` : "—" }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Ventes (DVF)", n(e.transactions.total)], ["Parcelles bâties", n(e.parcelles.baties)], ["Autorisations", n(e.permis.total)], ["Habitants", n(e.population?.population)]].map(([k, v]) => <div key={k} className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-xl font-bold">{v}</p></div>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section><h3 className="mb-2 text-sm font-semibold">Prix médian au m² — maisons</h3><Bars rows={price("maison")} /></section>
        <section><h3 className="mb-2 text-sm font-semibold">Prix médian au m² — appartements</h3><Bars rows={price("appartement")} /></section>
        <section><h3 className="mb-2 text-sm font-semibold">Transactions par type</h3><Bars rows={e.transactions.byType.map((t) => ({ label: t.type.replace("Local industriel. commercial ou assimilé", "Local pro"), v: t.n, text: `${n(t.n)}${t.median ? ` · ${n(t.median)} €/m²` : ""}` }))} /></section>
        <section><h3 className="mb-2 text-sm font-semibold">Durée de détention (parcelles bâties)</h3><Bars rows={e.detention.map((d) => ({ label: d.label, v: d.n, text: n(d.n) }))} /></section>
        <section><h3 className="mb-2 text-sm font-semibold">Étiquettes DPE</h3><Bars rows={e.dpe.map((d) => ({ label: d.label, v: d.n, text: n(d.n) }))} /></section>
        <section><h3 className="mb-2 text-sm font-semibold">Autorisations d&apos;urbanisme par année</h3><Bars rows={e.permis.byYear.map((p) => ({ label: String(p.year), v: p.n, text: `${n(p.n)} · ${n(p.logements)} logements` }))} /></section>
      </div>
      {e.social?.logements != null && <p className="text-sm">Parc locatif social (RPLS) : <strong>{n(e.social.logements)}</strong> logements.</p>}
      {e.notes.map((t, i) => <p key={i} className="text-xs text-muted-foreground">• {t}</p>)}
    </div>
  );
}

export function EtudesApp() {
  const zone = useUi((s) => s.zone);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [scope, setScope] = useState<Scope | null>(zone ? { polygon: zone, label: "Zone dessinée sur la carte" } : null);
  const run = useMutation({
    mutationFn: async (s: Scope) => {
      const r = await fetch("/api/etudes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify("insee" in s ? { insee: s.insee } : { polygon: s.polygon }) });
      if (!r.ok) throw new Error("Étude impossible");
      return (await r.json()) as Etude;
    },
  });
  const [pdfBusy, setPdfBusy] = useState(false);
  async function pdf() {
    if (!scope) return;
    setPdfBusy(true);
    const r = await fetch("/api/etudes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...("insee" in scope ? { insee: scope.insee } : { polygon: scope.polygon }), format: "pdf" }) });
    if (r.ok) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = "etude-de-zone.pdf";
      a.click();
    }
    setPdfBusy(false);
  }
  async function search(v: string) {
    setQ(v);
    if (v.trim().length < 3) return setHits([]);
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(v)}`);
    setHits(((await r.json()) as { hits: GeocodeHit[] }).hits.filter((h) => h.kind === "municipality" && h.citycode));
  }
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/carte" className="text-sm text-muted-foreground hover:underline">← Carte</Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Études de zone</h1>
      <p className="mb-4 text-sm text-muted-foreground">Choisissez une commune, ou dessinez une zone sur la carte puis revenez ici.</p>
      <div className="relative mb-4 flex max-w-xl gap-2">
        <div className="relative flex-1">
          <Input placeholder="Rechercher une commune…" value={q} onChange={(e) => void search(e.target.value)} aria-label="Commune" />
          {hits.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-popover p-1 shadow-lg">
              {hits.map((h) => <li key={h.citycode}><button className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { const s = { insee: h.citycode!, label: h.label }; setScope(s); setHits([]); setQ(h.label); run.mutate(s); }}>{h.label} <span className="text-xs text-muted-foreground">{h.context}</span></button></li>)}
            </ul>
          )}
        </div>
        {zone && <Button variant="outline" onClick={() => { const s = { polygon: zone, label: "Zone dessinée sur la carte" }; setScope(s); run.mutate(s); }}>Étudier la zone dessinée</Button>}
      </div>
      {run.isPending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Analyse en cours…</p>}
      {run.error && <p className="text-sm text-destructive">{(run.error as Error).message}</p>}
      {run.data && (
        <>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{run.data.label}</h2><Button onClick={pdf} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="animate-spin" /> : <FileDown />} Rapport PDF</Button></div>
          <Report e={run.data} />
        </>
      )}
    </main>
  );
}
