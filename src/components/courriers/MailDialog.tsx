"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export type MailScope = { idus: string[] } | { search: Record<string, unknown> };
interface Preview { selected: number; letters: number; excludedOpposition: number; duplicates: number; sample: { destinataire: string; adresse: string; subject: string; body: string } | null }
interface Template { id: string; name: string; subject: string | null; body: string }

/** Génération de courriers (PDF, publipostage CSV) pour une parcelle ou pour la sélection de la carte. */
export function MailDialog({ scope, onClose }: { scope: MailScope; onClose: () => void }) {
  const tpls = useQuery({ queryKey: ["letter-templates"], queryFn: async () => ((await (await fetch("/api/courriers/templates")).json()) as { templates: Template[] }).templates });
  const [tpl, setTpl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => { if (!tpl && tpls.data?.[0]) setTpl(tpls.data[0].id); }, [tpls.data, tpl]);

  async function call(format: "preview" | "pdf" | "csv") {
    setBusy(format);
    setErr("");
    const r = await fetch("/api/courriers/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: tpl, format, ...scope }) });
    if (!r.ok) {
      setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Génération impossible");
      setBusy(null);
      return;
    }
    if (format === "preview") setPreview((await r.json()) as Preview);
    else {
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = format === "pdf" ? "courriers.pdf" : "publipostage.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setBusy(null);
  }
  useEffect(() => {
    if (tpl) {
      setPreview(null);
      void call("preview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-popover p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Générer des courriers">
        <h2 className="text-base font-semibold">Courriers aux propriétaires</h2>
        <p className="mb-3 text-xs text-muted-foreground">Une lettre par propriétaire (dédoublonnée), liste d&apos;opposition respectée. Particuliers : « Au propriétaire » à l&apos;adresse du bien.</p>
        <label className="text-xs">Modèle
          <select className="mt-1 h-9 w-full rounded-md border bg-card px-2 text-sm" value={tpl} onChange={(e) => setTpl(e.target.value)}>{tpls.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </label>
        <p className="mt-1 text-xs"><Link href="/courriers" className="underline">Modifier les modèles, l&apos;agence et la signature</Link></p>
        {busy === "preview" && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Résolution des destinataires…</p>}
        {preview && (
          <div className="mt-3 space-y-2 text-sm">
            <p><strong>{preview.letters}</strong> lettre(s) sur {preview.selected} bien(s) sélectionné(s){preview.duplicates ? ` · ${preview.duplicates} doublon(s) écarté(s)` : ""}{preview.excludedOpposition ? ` · ${preview.excludedOpposition} en opposition` : ""}</p>
            {preview.sample && (
              <div className="rounded-lg border bg-card p-3 text-xs">
                <p className="font-semibold">{preview.sample.destinataire}</p><p className="text-muted-foreground">{preview.sample.adresse}</p>
                {preview.sample.subject && <p className="mt-2 font-medium">Objet : {preview.sample.subject}</p>}
                <p className="mt-2 whitespace-pre-line">{preview.sample.body.slice(0, 700)}{preview.sample.body.length > 700 ? "…" : ""}</p>
              </div>
            )}
          </div>
        )}
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="outline" disabled={!!busy || !preview?.letters} onClick={() => call("csv")}>{busy === "csv" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Publipostage CSV</Button>
          <Button disabled={!!busy || !preview?.letters} onClick={() => call("pdf")}>{busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />} PDF</Button>
        </div>
      </div>
    </div>
  );
}
