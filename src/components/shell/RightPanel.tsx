"use client";

import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { ParcelDetail } from "@/components/parcelle/ParcelDetail";
import { Button } from "@/components/ui/button";
import { useUi } from "@/lib/store";

export function RightPanel() {
  const { selected, select } = useUi();
  if (!selected) return null;
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[28rem] max-w-full flex-col border-l bg-card shadow-xl" aria-label="Fiche parcelle">
      <div className="flex items-start justify-between gap-2 border-b p-3">
        <div>
          <p className="text-xs text-muted-foreground">{selected.commune ?? "Parcelle"}</p>
          <h2 className="font-mono text-base font-semibold" data-testid="parcel-idu">{selected.idu}</h2>
        </div>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Ouvrir la page de la parcelle"><Link href={`/parcelle/${selected.idu}`}><ExternalLink /></Link></Button>
          <Button variant="ghost" size="icon" aria-label="Fermer la fiche (Échap)" onClick={() => select(null)}><X /></Button>
        </div>
      </div>
      <ParcelDetail key={selected.idu} idu={selected.idu} compact />
    </aside>
  );
}
