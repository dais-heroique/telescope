"use client";

import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasSupabase } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const next = new URLSearchParams(window.location.search).get("next") ?? "/carte";
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <Logo className="mb-6" />
        <h1 className="mb-1 text-xl font-semibold">Connexion</h1>
        {!hasSupabase ? (
          <p className="text-sm text-muted-foreground">Supabase n&apos;est pas configuré : l&apos;application tourne en mode démo, sans connexion requise.</p>
        ) : state === "sent" ? (
          <p className="text-sm">Un lien de connexion vient d&apos;être envoyé à <strong>{email}</strong>.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-muted-foreground">Recevez un lien magique par email.</p>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email professionnel</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@agence.fr" />
            </div>
            {state === "error" && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={state === "sending"}>
              {state === "sending" ? "Envoi…" : "Recevoir le lien"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
