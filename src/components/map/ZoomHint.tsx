"use client";

import { ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUi } from "@/lib/store";

/** Zoom à partir duquel les données (ventes, permis, copropriétés, parcelles importées) sont chargées. */
const DATA_ZOOM = 12;

/**
 * Indication affichée quand la carte est trop dézoomée : les données VIGIE (ventes, parcelles, scores…) ne sont chargées qu'à partir
 * d'un certain niveau de zoom, pour rester rapide sur toute la France. Le fond de carte, lui, reste toujours visible.
 */
export function ZoomHint() {
  const viewport = useUi((s) => s.viewport);
  if (!viewport || viewport.zoom >= DATA_ZOOM) return null;
  const [w, s, e, n] = viewport.bbox;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3" data-testid="zoom-hint">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-card/95 px-4 py-2 text-sm shadow-lg backdrop-blur">
        <span>
          Zoomez pour afficher les données : ventes et scores dès le zoom {DATA_ZOOM}, parcelles dès le zoom 14.
        </span>
        <Button size="sm" onClick={() => useUi.getState().fly((w + e) / 2, (s + n) / 2, 12.5)}>
          <ZoomIn className="size-4" /> Zoomer ici
        </Button>
      </div>
    </div>
  );
}
