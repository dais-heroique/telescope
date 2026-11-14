"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fmtM2 } from "@/lib/parcelle/format";
import { useUi } from "@/lib/store";

interface Cluster { idus: string[]; n: number; owners: number; surface: number; surfaceLibre: number; zone: string | null; lon: number; lat: number; adresse: string | null; floorArea: number }
interface Res { clusters: Cluster[]; assumptions: { emprise: number; niveaux: number; rendement: number }; truncated: boolean; error?: string }

/** Agrégation de parcelles contiguës (module Promoteurs) avec surface constructible indicative. */
export function ClustersDialog({ body, onClose }: { body: Record<string, unknown>; onClose: () => void }) {
  const [minArea, setMinArea] = useState(2000);
  const { select, fly } = useUi();
  const q = useQuery({
    queryKey: ["clusters", body, minArea],
    queryFn: async () => {
      const { sort: _sort, ...rest } = body;
      void _sort;
      const r = await fetch("/api/promoteurs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...rest, minArea }) });
      const j = (await r.json()) as Res;
      if (!r.ok) throw new Error(j.error ?? "Calcul impossible");
      return j;
    },
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-popover p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Parcelles contiguës">
        <h2 className="text-base font-semibold">Parcelles contiguës</h2>
        <p className="mb-3 text-xs text-muted-foreground">Groupes de parcelles voisines dans votre sélection (filtres + zone/vue).</p>
        <label className="mb-3 flex items-center gap-2 text-xs">Surface cumulée minimale (m²)<Input type="number" className="h-8 w-28" value={minArea} onChange={(e) => setMinArea(Number(e.target.value) || 0)} /></label>
        {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Calcul…</p>}
        {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
        {q.data && (
          <>
            <ul className="space-y-1.5">
              {q.data.clusters.length === 0 && <li className="text-sm text-muted-foreground">Aucun groupe contigu ne correspond.</li>}
              {q.data.clusters.map((c) => (
                <li key={c.idus[0]}>
                  <button className="w-full rounded-lg border p-2 text-left text-xs hover:bg-accent" onClick={() => { select({ idu: c.idus[0] }); fly(c.lon, c.lat, 17); onClose(); }}>
                    <span className="block text-sm font-medium">{c.n} parcelles · {fmtM2(c.surface)}{c.zone ? ` · zone ${c.zone}` : ""}</span>
                    <span className="block text-muted-foreground">{c.adresse ?? c.idus[0]} · {c.owners} propriétaire(s) · libre {fmtM2(c.surfaceLibre)}</span>
                    <span className="block">Surface de plancher indicative : <strong>≈ {c.floorArea.toLocaleString("fr-FR")} m²</strong></span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">Estimation indicative : emprise {Math.round(q.data.assumptions.emprise * 100)} %, {q.data.assumptions.niveaux} niveaux, rendement {Math.round(q.data.assumptions.rendement * 100)} %. Le règlement de PLU n&apos;est pas appliqué : à vérifier au cas par cas.</p>
          </>
        )}
      </div>
    </div>
  );
}
