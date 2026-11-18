"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useUi } from "@/lib/store";
import { useSectors } from "@/components/crm/hooks";
import { filtersSchema } from "@/lib/filters";
import { Header } from "./Header";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import { CommandPalette } from "./CommandPalette";
import { DrawToolbar } from "@/components/map/DrawToolbar";
import { ZoomHint } from "@/components/map/ZoomHint";

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

/** Les filtres et le module survivent au rechargement de la page (localStorage, jamais bloquant). */
function usePersistedFilters() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vigie:filters");
      const parsed = raw ? filtersSchema.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success) useUi.getState().setFilters(parsed.data);
    } catch {
      /* stockage indisponible */
    }
    return useUi.subscribe((s, prev) => {
      if (s.filters === prev.filters) return;
      try {
        localStorage.setItem("vigie:filters", JSON.stringify(s.filters));
      } catch {
        /* ignore */
      }
    });
  }, []);
}

/** L'opacité des résultats est retenue d'une visite à l'autre. */
function usePersistedOpacity() {
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("vigie:opacity"));
      if (Number.isFinite(v) && v >= 0.1 && v <= 1) useUi.getState().setResultOpacity(v);
    } catch {
      /* stockage indisponible */
    }
    return useUi.subscribe((s, prev) => {
      if (s.resultOpacity === prev.resultOpacity) return;
      try {
        localStorage.setItem("vigie:opacity", String(s.resultOpacity));
      } catch {
        /* ignore */
      }
    });
  }, []);
}

export function MapWorkspace() {
  usePersistedFilters();
  usePersistedOpacity();
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
          <ZoomHint />
          <RightPanel />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
