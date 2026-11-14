"use client";

import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setState(r.ok ? "sent" : "error");
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <Logo className="mb-6" />
        <h1 className="mb-1 text-xl font-semibold">Connexion</h1>
        {state === "sent" ? (
          <p className="text-sm">
            Si l&apos;adresse <strong>{email}</strong> est autorisée, un lien de connexion vient d&apos;être envoyé. Pas d&apos;email ? Demandez un lien à l&apos;administrateur.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-muted-foreground">Accès sur invitation. Recevez un lien magique par email.</p>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.fr" />
            </div>
            {state === "error" && <p className="text-sm text-destructive">Une erreur est survenue, réessayez.</p>}
            <Button type="submit" className="w-full" disabled={state === "sending"}>
              {state === "sending" ? "Envoi…" : "Recevoir le lien"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
