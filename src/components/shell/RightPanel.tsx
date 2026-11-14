"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUi } from "@/lib/store";

const TABS = ["Synthèse", "Bâti", "Ventes", "Énergie", "Urbanisme", "Propriétaire", "Risques", "Loyers"] as const;

export function RightPanel() {
  const { selected, select } = useUi();
  if (!selected) return null;
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[26rem] max-w-full flex-col border-l bg-card shadow-xl" aria-label="Fiche parcelle">
      <div className="flex items-start justify-between gap-2 border-b p-3">
        <div>
          <p className="text-xs text-muted-foreground">{selected.commune ?? "Parcelle"}</p>
          <h2 className="font-mono text-base font-semibold" data-testid="parcel-idu">
            {selected.idu}
          </h2>
          {selected.section && (
            <p className="text-xs text-muted-foreground">
              Section {selected.section} n° {selected.numero} · {selected.contenance?.toLocaleString("fr-FR")} m²
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Ouvrir la page de la parcelle">
            <Link href={`/parcelle/${selected.idu}`}>
              <ExternalLink />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Fermer la fiche (Échap)" onClick={() => select(null)}>
            <X />
          </Button>
        </div>
      </div>
      <Tabs defaultValue="Synthèse" className="flex min-h-0 flex-1 flex-col p-3">
        <TabsList className="h-auto flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t} value={t} className="min-h-0 flex-1 overflow-y-auto text-sm text-muted-foreground">
            {t === "Synthèse" ? (
              <p>Les données détaillées (DVF, DPE, PLU, propriétaire…) arrivent avec l&apos;ingestion — étapes 3 et 5.</p>
            ) : (
              <p>Onglet « {t} » — à venir.</p>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  );
}
