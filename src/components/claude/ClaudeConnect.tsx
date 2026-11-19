"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

const EXAMPLES = [
  "Trouve-moi à Annecy les immeubles en monopropriété avec un DPE F ou G, et classe-les par score.",
  "Fais-moi l'étude de marché de Thonon-les-Bains : prix médians, ancienneté de détention, permis récents.",
  "Pour la parcelle 74010000BY0129, résume la fiche : score, dernière vente, zone PLU, propriétaire et risques.",
  "Cherche des terrains divisibles autour du 12 rue de la Paix à Annecy dans un rayon de 400 m et prépare-moi une liste de 5 à contacter.",
  "Ajoute la parcelle 74010000BY0129 à mon CRM avec une tâche de relance le 15 du mois prochain.",
];

export function ClaudeConnect() {
  const [url, setUrl] = useState("/api/mcp");
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(`${window.location.origin}/api/mcp`), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* copie impossible : l'adresse reste sélectionnable */
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/carte" className="text-sm text-muted-foreground hover:underline">← Carte</Link>
      <h1 className="mb-1 mt-2 text-2xl font-semibold">Connecter Claude</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Avec un abonnement Claude (Pro ou plus), sans clé API : Claude peut consulter VIGIE pendant vos conversations — chercher des parcelles, lire les fiches, faire des études de zone et gérer le CRM — pour vous aider à prospecter.
      </p>

      <section className="mb-5 rounded-xl border bg-card p-4">
        <p className="mb-2 text-sm font-medium">Adresse du connecteur</p>
        <div className="flex gap-2">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Adresse du connecteur" className="h-9 flex-1 rounded-md border bg-background px-3 font-mono text-sm" data-testid="mcp-url" />
          <Button onClick={copy} variant="outline">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copié" : "Copier"}
          </Button>
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mise en place (une seule fois)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Ouvrez <strong>claude.ai</strong> (ou l&apos;application Claude) → <strong>Paramètres</strong> → <strong>Connecteurs</strong>.</li>
          <li>Choisissez <strong>Ajouter un connecteur personnalisé</strong>, donnez-lui le nom « VIGIE » et collez l&apos;adresse ci-dessus.</li>
          <li>Claude ouvre une page VIGIE : saisissez votre <strong>code d&apos;accès</strong> puis <strong>Autoriser Claude</strong>.</li>
          <li>Dans une conversation, ouvrez le menu des outils et <strong>activez VIGIE</strong>. Posez ensuite vos questions en langage courant.</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          Si l&apos;option « connecteur personnalisé » n&apos;apparaît pas dans votre compte, elle n&apos;est pas encore disponible pour votre offre ou doit être activée par l&apos;administrateur de votre organisation.
        </p>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ce que Claude peut faire</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Situer une adresse ou une commune et chercher des parcelles avec les mêmes filtres que la carte (DPE, usage, surface, ventes, détention, personnes morales, signaux…).</li>
          <li>Lire la fiche complète d&apos;une parcelle : score expliqué, bâti, ventes et comparables, énergie, urbanisme (PLU, permis), propriétaire (personnes morales), risques, loyers.</li>
          <li>Produire une étude de marché d&apos;une commune ou d&apos;une zone.</li>
          <li>Lire le CRM, et — seulement si vous le demandez — ajouter un lead, une note ou une tâche.</li>
        </ul>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Exemples à demander</h2>
        <ul className="space-y-2">
          {EXAMPLES.map((e) => (
            <li key={e} className="rounded-lg border bg-card px-3 py-2 text-sm">{e}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">À savoir</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Les informations que Claude consulte (résultats de recherche, fiches, notes du CRM) sont intégrées à votre conversation avec Claude : elles sont donc traitées par Anthropic selon les conditions de votre compte Claude.</li>
          <li>L&apos;accès se retire à tout moment depuis les paramètres de Claude (Connecteurs → VIGIE → Retirer). Changer le code d&apos;accès de VIGIE ne retire pas un accès déjà accordé : retirez-le dans Claude.</li>
          <li>Le score de probabilité de vente est une estimation, pas une certitude. Vérifiez les informations avant toute démarche.</li>
        </ul>
      </section>
    </main>
  );
}
