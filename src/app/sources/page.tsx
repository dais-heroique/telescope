import type { Metadata } from "next";
import Link from "next/link";
import { SOURCES } from "@/config/sources";

export const metadata: Metadata = { title: "Sources et licences" };

export default function SourcesPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Accueil</Link>
      <h1 className="mt-4 text-3xl font-semibold">Sources et licences</h1>
      <p className="mt-3 text-muted-foreground">
        VIGIE n&apos;utilise que des données publiques ou ouvertes. Aucune donnée nominative de personne physique n&apos;est collectée ni affichée :
        pour les propriétaires particuliers, seule l&apos;adresse du bien est utilisée.
      </p>
      <ul className="mt-8 divide-y rounded-xl border bg-card">
        {SOURCES.map((s) => (
          <li key={s.name} className="grid gap-1 p-4 sm:grid-cols-[1fr_auto] sm:items-baseline">
            <div>
              <a href={s.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{s.name}</a>
              <p className="text-sm text-muted-foreground">{s.provider} · {s.usage}</p>
            </div>
            <p className="text-xs text-muted-foreground sm:text-right">{s.licence}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
