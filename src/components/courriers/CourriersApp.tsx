"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LETTER_VARIABLES } from "@/lib/mail/render";

interface Template { id: string; name: string; subject: string | null; body: string }
interface Settings { agence: string; agent: string; signature: string; expediteur: string; logo: string | null }

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "erreur");
  return (await r.json()) as T;
}

function Templates() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["letter-templates"], queryFn: () => j<{ templates: Template[] }>("/api/courriers/templates").then((r) => r.templates) });
  const [sel, setSel] = useState<string>("");
  const [f, setF] = useState({ name: "", subject: "", body: "" });
  const cur = q.data?.find((t) => t.id === sel);
  useEffect(() => { if (!sel && q.data?.[0]) setSel(q.data[0].id); }, [q.data, sel]);
  useEffect(() => { if (cur) setF({ name: cur.name, subject: cur.subject ?? "", body: cur.body }); }, [cur]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["letter-templates"] });
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Modèles de lettres</h2>
      <div className="flex flex-wrap gap-1.5">
        {q.data?.map((t) => <button key={t.id} onClick={() => setSel(t.id)} className={`rounded-md border px-2 py-1 text-xs ${sel === t.id ? "border-beacon bg-accent font-medium" : ""}`}>{t.name}</button>)}
        <Button size="sm" variant="outline" onClick={async () => { const r = await j<{ id: string }>("/api/courriers/templates", { method: "POST", body: JSON.stringify({ name: "Nouveau modèle", subject: "", body: "{{destinataire}},\n\n…\n\n{{signature}}" }) }); await refresh(); setSel(r.id); }}>+ Nouveau</Button>
      </div>
      {cur && (
        <div className="space-y-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Nom du modèle" />
          <Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Objet" aria-label="Objet" />
          <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={14} className="w-full rounded-md border bg-card p-2 font-mono text-xs" aria-label="Corps de la lettre" />
          <p className="text-[11px] text-muted-foreground">Variables : {LETTER_VARIABLES.map((v) => <code key={v.key} title={v.label} className="mr-1 rounded bg-muted px-1">{`{{${v.key}}}`}</code>)}</p>
          <div className="flex gap-2">
            <Button onClick={async () => { await j(`/api/courriers/templates/${cur.id}`, { method: "PUT", body: JSON.stringify({ name: f.name, subject: f.subject || null, body: f.body }) }); await refresh(); }}>Enregistrer</Button>
            <Button variant="ghost" className="text-destructive" onClick={async () => { if (confirm("Supprimer ce modèle ?")) { await j(`/api/courriers/templates/${cur.id}`, { method: "DELETE" }); setSel(""); await refresh(); } }}><Trash2 /> Supprimer</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function AgencyForm() {
  const q = useQuery({ queryKey: ["letter-settings"], queryFn: () => j<{ settings: Settings }>("/api/courriers/settings").then((r) => r.settings) });
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (q.data) setS(q.data); }, [q.data]);
  if (!s) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Agence & signature</h2>
      <Input placeholder="Nom de l'agence" value={s.agence} onChange={(e) => setS({ ...s, agence: e.target.value })} />
      <Input placeholder="Nom de l'agent" value={s.agent} onChange={(e) => setS({ ...s, agent: e.target.value })} />
      <textarea rows={3} className="w-full rounded-md border bg-card p-2 text-sm" placeholder="Signature (nom, téléphone, email…)" value={s.signature} onChange={(e) => setS({ ...s, signature: e.target.value })} />
      <textarea rows={3} className="w-full rounded-md border bg-card p-2 text-sm" placeholder="Adresse de l'expéditeur (en-tête)" value={s.expediteur} onChange={(e) => setS({ ...s, expediteur: e.target.value })} />
      <div className="flex items-center gap-3 text-xs">
        <label>Logo (PNG/JPEG, 300 Ko max)
          <input type="file" accept="image/png,image/jpeg" className="block" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 300_000) return alert("Logo trop lourd (300 Ko max)."); const rd = new FileReader(); rd.onload = () => setS({ ...s, logo: String(rd.result) }); rd.readAsDataURL(file); }} />
        </label>
        {s.logo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.logo} alt="Logo" className="h-10" />
            <button className="underline" onClick={() => setS({ ...s, logo: null })}>retirer</button>
          </>
        )}
      </div>
      <Button onClick={async () => { await j("/api/courriers/settings", { method: "PUT", body: JSON.stringify(s) }); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? "Enregistré ✓" : "Enregistrer"}</Button>
    </section>
  );
}

function Opposition() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["opposition"], queryFn: () => j<{ items: { key: string; address: string; reason: string | null }[] }>("/api/courriers/opposition").then((r) => r.items) });
  const [a, setA] = useState("");
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Liste d&apos;opposition (ne plus écrire)</h2>
      <form className="flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (a.trim().length >= 5) { await j("/api/courriers/opposition", { method: "POST", body: JSON.stringify({ address: a }) }); setA(""); qc.invalidateQueries({ queryKey: ["opposition"] }); } }}>
        <Input placeholder="12 rue des Lilas 74000 Annecy" value={a} onChange={(e) => setA(e.target.value)} /><Button type="submit">Ajouter</Button>
      </form>
      <ul className="divide-y rounded-lg border bg-card text-sm">
        {q.data?.length === 0 && <li className="p-2 text-muted-foreground">Aucune adresse.</li>}
        {q.data?.map((o) => <li key={o.key} className="flex items-center justify-between p-2"><span>{o.address}</span><Button size="icon" variant="ghost" aria-label="Retirer" onClick={async () => { await j(`/api/courriers/opposition?key=${encodeURIComponent(o.key)}`, { method: "DELETE" }); qc.invalidateQueries({ queryKey: ["opposition"] }); }}><Trash2 /></Button></li>)}
      </ul>
    </section>
  );
}

function History() {
  const q = useQuery({ queryKey: ["mail-history"], queryFn: () => j<{ items: { id: string; idu: string; recipient: string | null; address: string | null; kind: string; created_by: string | null; created_at: number; template: string | null }[] }>("/api/courriers/history").then((r) => r.items) });
  return (
    <section className="space-y-2 lg:col-span-2">
      <h2 className="text-sm font-semibold">Historique des envois</h2>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground"><tr><th className="p-2">Date</th><th>Parcelle</th><th>Destinataire</th><th>Adresse</th><th>Type</th><th>Par</th></tr></thead>
          <tbody>{q.data?.map((h) => <tr key={h.id} className="border-t"><td className="p-2">{new Date(h.created_at * 1000).toLocaleDateString("fr-FR")}</td><td><Link href={`/carte?p=${h.idu}`} className="font-mono underline">{h.idu}</Link></td><td>{h.recipient}</td><td>{h.address}</td><td>{h.kind}</td><td>{h.created_by?.split("@")[0]}</td></tr>)}</tbody>
        </table>
        {q.data?.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucun courrier généré pour l&apos;instant.</p>}
      </div>
    </section>
  );
}

export function CourriersApp() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/carte" className="text-sm text-muted-foreground hover:underline">← Carte</Link>
      <h1 className="mb-5 mt-2 text-2xl font-semibold">Courriers</h1>
      <div className="grid gap-8 lg:grid-cols-2">
        <Templates />
        <div className="space-y-8"><AgencyForm /><Opposition /></div>
        <History />
      </div>
    </main>
  );
}
