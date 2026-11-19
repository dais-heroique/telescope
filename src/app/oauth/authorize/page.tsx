"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Form() {
  const sp = useSearchParams();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const params = Object.fromEntries(["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state"].map((k) => [k, sp.get(k) ?? undefined]));
  const incomplete = !params.client_id || !params.redirect_uri || !params.code_challenge;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/oauth/authorize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...params, code }) });
    const j = (await r.json().catch(() => ({}))) as { redirectTo?: string; error?: string };
    if (r.ok && j.redirectTo) {
      window.location.href = j.redirectTo;
      return;
    }
    setMsg(j.error ?? "Une erreur est survenue.");
    setCode("");
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <Logo className="mb-2" />
        <h1 className="text-lg font-semibold">Connecter Claude à VIGIE</h1>
        <p className="text-sm text-muted-foreground">
          Claude pourra consulter les données de VIGIE (recherche de parcelles, fiches, études de zone, CRM) pour vous aider dans vos conversations. Saisissez le code d&apos;accès pour autoriser.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="code">Code d&apos;accès</Label>
          <Input id="code" type="password" inputMode="numeric" autoComplete="off" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} className="text-center text-lg tracking-[0.5em]" />
        </div>
        {incomplete && <p className="text-sm text-destructive">Lien incomplet : relancez la connexion depuis Claude.</p>}
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <Button type="submit" className="w-full" disabled={busy || !code || incomplete}>
          {busy ? "Vérification…" : "Autoriser Claude"}
        </Button>
      </form>
    </main>
  );
}

export default function AuthorizePage() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
