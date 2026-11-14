"use client";

import dynamic from "next/dynamic";
import { Header } from "./Header";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import { CommandPalette } from "./CommandPalette";

// MapLibre accède à window/WebGL : rendu client uniquement.
const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Chargement de la carte…</div>,
});

export function MapWorkspace() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <main className="relative min-w-0 flex-1">
          <MapView />
          <RightPanel />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
