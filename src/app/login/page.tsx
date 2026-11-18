"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const next = useSearchParams().get("next");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error" | "limit">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (r.ok) {
      // Redirection interne uniquement
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/carte";
      return;
    }
    setState(r.status === 429 ? "limit" : "error");
    setCode("");
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <Logo className="mb-2" />
        <div className="space-y-1.5">
          <Label htmlFor="code">Code d&apos;accès</Label>
          <Input id="code" name="code" type="password" inputMode="numeric" autoComplete="off" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} className="text-center text-lg tracking-[0.5em]" aria-invalid={state === "error"} />
        </div>
        {state === "error" && <p className="text-sm text-destructive">Code incorrect.</p>}
        {state === "limit" && <p className="text-sm text-destructive">Trop d&apos;essais, réessayez dans quelques minutes.</p>}
        <Button type="submit" className="w-full" disabled={state === "busy" || !code}>
          {state === "busy" ? "Vérification…" : "Entrer"}
        </Button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
