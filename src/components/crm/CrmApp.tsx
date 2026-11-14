"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarCheck, MapPin, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGES, type Contact, type Lead, type StageKey } from "@/lib/crm/types";
import { fmtDate, fmtEur } from "@/lib/parcelle/format";
import { crm, useContacts, useCrmMutation, useDashboard, useLeads, useSectors, useTasks, useUsers } from "./hooks";

const TABS = ["Pipeline", "Tâches", "Contacts", "Équipe & secteurs"] as const;
const shortName = (e: string | null) => (e ? e.split("@")[0] : "—");

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: (l: Lead) => void }) {
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/lead", lead.id)} onClick={() => onOpen(lead)} className="cursor-grab rounded-lg border bg-card p-2.5 text-xs shadow-sm hover:border-beacon active:cursor-grabbing" data-testid="lead-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{lead.title ?? lead.adresse ?? lead.idu}</p>
        {lead.score !== null && <Badge variant="beacon">{lead.score}</Badge>}
      </div>
      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{lead.idu}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
        {lead.contactName && <span>👤 {lead.contactName}</span>}
        {lead.assignedTo && <span>@{shortName(lead.assignedTo)}</span>}
        {lead.nbTasks > 0 && <span className="inline-flex items-center gap-0.5"><CalendarCheck className="size-3" />{lead.nbTasks}</span>}
        {lead.value ? <span>{fmtEur(lead.value)}</span> : null}
      </div>
    </div>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const users = useUsers();
  const contacts = useContacts();
  const tasks = useTasks(`?lead=${lead.id}`);
  const [note, setNote] = useState("");
  const [task, setTask] = useState({ title: "", dueAt: "" });
  const patch = useCrmMutation((b: Record<string, unknown>) => crm.patchLead(lead.id, b));
  const del = useCrmMutation(() => crm.deleteLead(lead.id));
  const addTask = useCrmMutation((b: Record<string, unknown>) => crm.addTask({ ...b, leadId: lead.id }));
  const toggle = useCrmMutation((v: { id: string; done: boolean }) => crm.patchTask(v.id, { done: v.done }));
  const addNote = useCrmMutation((b: string) => crm.addNote(lead.id, b));
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-l bg-card p-4 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{lead.title ?? lead.adresse ?? lead.idu}</h2>
            <p className="font-mono text-xs text-muted-foreground">{lead.idu}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/carte?p=${lead.idu}`}><MapPin /> Voir sur la carte</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/parcelle/${lead.idu}`}>Fiche</Link></Button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label>Étape<select className="h-8 w-full rounded-md border bg-card px-2" value={lead.stage} onChange={(e) => patch.mutate({ stage: e.target.value })}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
          <label>Responsable<select className="h-8 w-full rounded-md border bg-card px-2" value={lead.assignedTo ?? ""} onChange={(e) => patch.mutate({ assignedTo: e.target.value || null })}><option value="">—</option>{users.data?.users.map((u) => <option key={u.email} value={u.email}>{shortName(u.email)}</option>)}</select></label>
          <label>Contact<select className="h-8 w-full rounded-md border bg-card px-2" value={lead.contactId ?? ""} onChange={(e) => patch.mutate({ contactId: e.target.value || null })}><option value="">—</option>{contacts.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Valeur estimée (€)<Input className="h-8 text-xs" type="number" defaultValue={lead.value ?? ""} onBlur={(e) => patch.mutate({ value: e.target.value ? Number(e.target.value) : null })} /></label>
        </div>
        <section>
          <h3 className="mb-1 text-sm font-semibold">Tâches</h3>
          <ul className="space-y-1 text-sm">
            {tasks.data?.map((t) => (
              <li key={t.id} className="flex items-center gap-2"><input type="checkbox" checked={t.done} onChange={(e) => toggle.mutate({ id: t.id, done: e.target.checked })} /><span className={t.done ? "text-muted-foreground line-through" : ""}>{t.title}</span>{t.dueAt && <span className="ml-auto text-xs text-muted-foreground">{fmtDate(t.dueAt)}</span>}</li>
            ))}
          </ul>
          <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (task.title.trim()) { addTask.mutate({ title: task.title, dueAt: task.dueAt || undefined }); setTask({ title: "", dueAt: "" }); } }}>
            <Input className="h-8 text-xs" placeholder="Nouvelle tâche…" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
            <Input className="h-8 w-36 text-xs" type="date" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} aria-label="Échéance" />
            <Button size="sm" type="submit"><Plus /></Button>
          </form>
        </section>
        <NotesBlock leadId={lead.id} note={note} setNote={setNote} onAdd={(b) => addNote.mutate(b)} />
        <Button variant="ghost" size="sm" className="mt-auto text-destructive" onClick={() => { if (confirm("Retirer ce bien du CRM ?")) { del.mutate(undefined); onClose(); } }}><Trash2 /> Retirer du CRM</Button>
      </aside>
    </div>
  );
}

function NotesBlock({ leadId, note, setNote, onAdd }: { leadId: string; note: string; setNote: (s: string) => void; onAdd: (b: string) => void }) {
  const { data } = useLeadNotes(leadId);
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">Notes & commentaires</h3>
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (note.trim()) { onAdd(note); setNote(""); } }}>
        <Input className="h-8 text-xs" placeholder="Ajouter une note…" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" type="submit">Ajouter</Button>
      </form>
      <ul className="mt-2 space-y-1.5 text-xs">{data?.map((n) => <li key={n.id} className="rounded border p-2"><p>{n.body}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{shortName(n.author)} · {new Date(n.createdAt * 1000).toLocaleString("fr-FR")}</p></li>)}</ul>
    </section>
  );
}
function useLeadNotes(leadId: string) {
  return useQuery({ queryKey: ["crm", "notes", leadId], queryFn: async () => ((await (await fetch(`/api/crm/leads/${leadId}/notes`)).json()) as { notes: { id: string; body: string; author: string | null; createdAt: number }[] }).notes });
}

function Pipeline() {
  const leads = useLeads();
  const move = useCrmMutation((v: { id: string; stage: StageKey }) => crm.patchLead(v.id, { stage: v.stage }));
  const [open, setOpen] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const users = useUsers();
  const list = useMemo(() => (leads.data ?? []).filter((l) => !mine || l.assignedTo === users.data?.me), [leads.data, mine, users.data]);
  const current = list.find((l) => l.id === open) ?? null;
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mes biens uniquement</label>
      {leads.data?.length === 0 && <p className="mb-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">Aucun bien suivi. Ouvrez une fiche parcelle sur la carte et cliquez « Ajouter au CRM ».</p>}
      <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(210px, 1fr))` }}>
        {STAGES.map((s) => {
          const items = list.filter((l) => l.stage === s.key);
          return (
            <div key={s.key} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/lead"); if (id) move.mutate({ id, stage: s.key }); }} className="min-h-40 rounded-xl bg-muted/60 p-2" data-testid={`col-${s.key}`}>
              <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.label}<span className="rounded-full bg-card px-1.5">{items.length}</span></p>
              <div className="space-y-2">{items.map((l) => <LeadCard key={l.id} lead={l} onOpen={(x) => setOpen(x.id)} />)}</div>
            </div>
          );
        })}
      </div>
      {current && <LeadDrawer lead={current} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TasksView() {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const tasks = useTasks(`?done=0${scope === "mine" ? "&mine=1" : ""}`);
  const users = useUsers();
  const toggle = useCrmMutation((v: { id: string; done: boolean }) => crm.patchTask(v.id, { done: v.done }));
  const add = useCrmMutation((b: Record<string, unknown>) => crm.addTask(b));
  const [f, setF] = useState({ title: "", dueAt: "", assignedTo: "" });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex gap-2 text-xs">{(["mine", "all"] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={`rounded-md px-2.5 py-1 ${scope === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{s === "mine" ? "Mes tâches" : "Toute l'équipe"}</button>)}</div>
      <form className="flex flex-wrap gap-1.5" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) { add.mutate({ title: f.title, dueAt: f.dueAt || undefined, assignedTo: f.assignedTo || undefined }); setF({ title: "", dueAt: "", assignedTo: "" }); } }}>
        <Input className="min-w-48 flex-1" placeholder="Nouvelle tâche / rappel…" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Input className="w-40" type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} aria-label="Échéance" />
        <select className="h-9 rounded-md border bg-card px-2 text-sm" value={f.assignedTo} onChange={(e) => setF({ ...f, assignedTo: e.target.value })} aria-label="Assigné à"><option value="">Moi</option>{users.data?.users.map((u) => <option key={u.email} value={u.email}>{shortName(u.email)}</option>)}</select>
        <Button type="submit"><Plus /> Ajouter</Button>
      </form>
      <ul className="divide-y rounded-xl border bg-card">
        {tasks.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">Aucune tâche ouverte.</li>}
        {tasks.data?.map((t) => (
          <li key={t.id} className="flex items-center gap-2 p-3 text-sm">
            <input type="checkbox" onChange={(e) => toggle.mutate({ id: t.id, done: e.target.checked })} aria-label={`Terminer ${t.title}`} />
            <span className="flex-1">{t.title}{t.leadIdu && <Link href={`/carte?p=${t.leadIdu}`} className="ml-2 font-mono text-[10px] text-muted-foreground underline">{t.leadIdu}</Link>}</span>
            <span className="text-xs text-muted-foreground">{shortName(t.assignedTo)}</span>
            {t.dueAt && <span className={`text-xs ${t.dueAt < today ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{fmtDate(t.dueAt)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactsView() {
  const contacts = useContacts();
  const add = useCrmMutation((b: Record<string, unknown>) => crm.addContact(b));
  const del = useCrmMutation((id: string) => crm.deleteContact(id));
  const [f, setF] = useState({ name: "", email: "", phone: "", address: "" });
  return (
    <div className="max-w-3xl space-y-3">
      <form className="grid gap-1.5 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) { add.mutate({ name: f.name, email: f.email || null, phone: f.phone || null, address: f.address || null }); setF({ name: "", email: "", phone: "", address: "" }); } }}>
        <Input placeholder="Nom *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input placeholder="Téléphone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="Adresse" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <Button type="submit"><Plus /> Ajouter</Button>
      </form>
      <ul className="divide-y rounded-xl border bg-card">
        {contacts.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">Aucun contact.</li>}
        {contacts.data?.map((c: Contact) => (
          <li key={c.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1"><p className="font-medium">{c.name} <Badge variant="secondary">{c.kind}</Badge></p><p className="truncate text-xs text-muted-foreground">{[c.email, c.phone, c.address].filter(Boolean).join(" · ")}</p></div>
            <span className="text-xs text-muted-foreground">{c.nbLeads} bien(s)</span>
            <Button size="icon" variant="ghost" aria-label={`Supprimer ${c.name}`} onClick={() => confirm(`Supprimer ${c.name} ?`) && del.mutate(c.id)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamView() {
  const dash = useDashboard();
  const sectors = useSectors();
  const users = useUsers();
  const patch = useCrmMutation((v: { id: string; body: Record<string, unknown> }) => crm.patchSector(v.id, v.body));
  const del = useCrmMutation((id: string) => crm.deleteSector(id));
  const d = dash.data;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Tableau de bord</h2>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {[["Biens suivis", Object.values(d?.byStage ?? {}).reduce((a, b) => a + b, 0)], ["Tâches ouvertes", d?.tasks.open ?? 0], ["En retard", d?.tasks.overdue ?? 0]].map(([k, v]) => <div key={String(k)} className="rounded-lg border bg-card p-3"><p className="text-muted-foreground">{k}</p><p className="text-xl font-bold">{v}</p></div>)}
        </div>
        <ul className="space-y-1 text-xs">{STAGES.map((s) => <li key={s.key} className="flex justify-between rounded border bg-card px-2 py-1"><span>{s.label}</span><strong>{d?.byStage[s.key] ?? 0}</strong></li>)}</ul>
        <h3 className="text-sm font-semibold">Par agent</h3>
        <ul className="space-y-1 text-xs">{d?.byAgent.map((a) => <li key={a.agent ?? "none"} className="flex justify-between rounded border bg-card px-2 py-1"><span>{shortName(a.agent)}</span><span>{a.leads} biens · {a.won} vendus</span></li>)}</ul>
        <h3 className="text-sm font-semibold">Activité récente</h3>
        <ul className="space-y-1 text-xs">{d?.activity.map((a) => <li key={a.id} className="rounded border bg-card px-2 py-1"><strong>{shortName(a.author)}</strong> {a.text} <span className="text-muted-foreground">· {new Date(a.at * 1000).toLocaleString("fr-FR")}</span></li>)}</ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Secteurs de prospection</h2>
        <p className="text-xs text-muted-foreground">Dessinez une zone sur la carte (outils polygone / cercle / isochrone) puis « Enregistrer comme secteur » dans l&apos;onglet Résultats. Ils s&apos;affichent ensuite sur la carte avec le nom de l&apos;agent.</p>
        <ul className="space-y-1.5">
          {sectors.data?.length === 0 && <li className="text-sm text-muted-foreground">Aucun secteur.</li>}
          {sectors.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg border bg-card p-2 text-sm">
              <i className="size-3 rounded-sm" style={{ background: s.color }} />
              <span className="flex-1 font-medium">{s.name}</span>
              <select className="h-8 rounded-md border bg-card px-1 text-xs" value={s.assignedTo ?? ""} onChange={(e) => patch.mutate({ id: s.id, body: { assignedTo: e.target.value || null } })} aria-label={`Agent du secteur ${s.name}`}>
                <option value="">Non attribué</option>{users.data?.users.map((u) => <option key={u.email} value={u.email}>{shortName(u.email)}</option>)}
              </select>
              <Button size="icon" variant="ghost" aria-label={`Supprimer ${s.name}`} onClick={() => confirm(`Supprimer le secteur ${s.name} ?`) && del.mutate(s.id)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function CrmApp() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Pipeline");
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <Link href="/carte" className="text-sm text-muted-foreground hover:underline">← Carte</Link>
      <h1 className="mb-4 mt-2 text-2xl font-semibold">CRM</h1>
      <div role="tablist" className="mb-5 inline-flex gap-1 rounded-lg bg-muted p-1 text-sm">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}>{t}</button>)}
      </div>
      {tab === "Pipeline" && <Pipeline />}
      {tab === "Tâches" && <TasksView />}
      {tab === "Contacts" && <ContactsView />}
      {tab === "Équipe & secteurs" && <TeamView />}
    </main>
  );
}
