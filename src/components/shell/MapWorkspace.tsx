"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useUi } from "@/lib/store";
import { useSectors } from "@/components/crm/hooks";
import { Header } from "./Header";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import { CommandPalette } from "./CommandPalette";
import { DrawToolbar } from "@/components/map/DrawToolbar";

// MapLibre accède à window/WebGL : rendu client uniquement.
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Chargement de la carte…</div>,
});

/** `/carte?p=<IDU>` : ouvre la fiche de la parcelle et centre la carte dessus (liens depuis le CRM). */
function useDeepLink() {
  const p = useSearchParams().get("p");
  useEffect(() => {
    if (!p || !/^[0-9AB]{5}[0-9]{3}[0-9A-Z]{2}[0-9]{4}$/i.test(p)) return;
    void fetch(`/api/parcelle/${p.toUpperCase()}`).then(async (r) => {
      if (!r.ok) return;
      const b = (await r.json()) as { idu: string; centroid: [number, number]; section: string; numero: string; insee: string; commune: string | null };
      useUi.getState().select({ idu: b.idu, section: b.section, numero: b.numero, codeInsee: b.insee, commune: b.commune ?? undefined });
      useUi.getState().fly(b.centroid[0], b.centroid[1], 18);
    });
  }, [p]);
}

function useSectorsSync() {
  const q = useSectors();
  useEffect(() => {
    if (q.data) useUi.getState().setSectors(q.data);
  }, [q.data]);
}

export function MapWorkspace() {
  useDeepLink();
  useSectorsSync();
  const leftOpen = useUi((s) => s.leftOpen);
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header />
      <div className="flex min-h-0 flex-1">
        {leftOpen && <LeftPanel />}
        <main className="relative min-w-0 flex-1">
          <MapView />
          <DrawToolbar />
          <RightPanel />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
