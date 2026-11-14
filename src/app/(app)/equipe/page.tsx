"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface U { email: string; name: string | null; is_admin: number; last_login_at: number | null }

export default function EquipePage() {
  const [users, setUsers] = useState<U[]>([]);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/equipe");
    if (r.status === 403) return setErr("Réservé aux administrateurs.");
    setUsers(((await r.json()) as { users: U[] }).users);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function invite(to: string) {
    setErr("");
    const r = await fetch("/api/equipe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: to }) });
    if (!r.ok) return setErr("Email invalide.");
    const j = (await r.json()) as { link: string; emailed: boolean };
    setLink({ email: to, url: j.link, emailed: j.emailed });
    setEmail("");
    void load();
  }
  async function remove(u: string) {
    if (!confirm(`Retirer l'accès de ${u} ?`)) return;
    await fetch(`/api/equipe?email=${encodeURIComponent(u)}`, { method: "DELETE" });
    void load();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/carte" className="text-sm text-muted-foreground hover:underline">← Carte</Link>
      <h1 className="mt-3 text-2xl font-semibold">Équipe</h1>
      <p className="mt-1 text-sm text-muted-foreground">Invitez quelques personnes : elles se connectent avec un lien magique. Tous les membres voient les mêmes données et le même CRM.</p>
      <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); void invite(email); }}>
        <Input type="email" required placeholder="email@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit">Inviter</Button>
      </form>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      {link && (
        <div className="mt-4 rounded-lg border bg-card p-3 text-sm">
          <p className="mb-2">{link.emailed ? `Lien envoyé à ${link.email}. ` : `Aucun email envoyé : transmettez ce lien à ${link.email} (valable 20 min, usage unique) :`}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{link.url}</code>
            <Button size="icon" variant="outline" aria-label="Copier le lien" onClick={() => { void navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
      )}
      <ul className="mt-6 divide-y rounded-xl border bg-card">
        {users.map((u) => (
          <li key={u.email} className="flex items-center justify-between gap-2 p-3 text-sm">
            <div>
              <p className="font-medium">{u.email} {u.is_admin ? <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px]">admin</span> : null}</p>
              <p className="text-xs text-muted-foreground">{u.last_login_at ? `Dernière connexion : ${new Date(u.last_login_at * 1000).toLocaleString("fr-FR")}` : "Jamais connecté"}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => invite(u.email)}>Nouveau lien</Button>
              {!u.is_admin && <Button size="icon" variant="ghost" aria-label={`Retirer ${u.email}`} onClick={() => remove(u.email)}><Trash2 /></Button>}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
