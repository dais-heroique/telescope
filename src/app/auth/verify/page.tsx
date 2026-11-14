"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  // Confirmation explicite par bouton : les scanners de liens d'emails ne consomment pas le jeton.
  async function confirm() {
    setState("busy");
    const r = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (r.ok) router.replace("/carte");
    else setState("error");
  }
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <Logo className="mb-6" />
        <h1 className="mb-3 text-xl font-semibold">Confirmer la connexion</h1>
        {state === "error" && <p className="mb-3 text-sm text-destructive">Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.</p>}
        <Button className="w-full" onClick={confirm} disabled={state === "busy" || !token}>
          {state === "busy" ? "Connexion…" : "Se connecter à VIGIE"}
        </Button>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
