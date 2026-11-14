import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sources et licences" };

export default function SourcesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">← Accueil</Link>
      <h1 className="mt-4 text-3xl font-semibold">Sources et licences</h1>
      <p className="mt-3 text-muted-foreground">La liste détaillée de chaque jeu de données, avec sa licence et sa fréquence de mise à jour, est publiée ici au fil de l&apos;intégration (voir docs/sources.md).</p>
    </main>
  );
}
