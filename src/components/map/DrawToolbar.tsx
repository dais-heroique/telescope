"use client";

import { Circle, Clock, Pentagon, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUi, type DrawMode } from "@/lib/store";

const TOOLS: { mode: Exclude<DrawMode, null>; label: string; icon: typeof Circle; hint: string }[] = [
  { mode: "polygon", label: "Polygone", icon: Pentagon, hint: "Cliquez pour placer les sommets ; cliquez le 1er point ou Entrée pour terminer" },
  { mode: "circle", label: "Cercle", icon: Circle, hint: "Cliquez le centre puis un point du rayon" },
  { mode: "isochrone", label: "Isochrone", icon: Clock, hint: "Cliquez un point de départ" },
];

export function DrawToolbar() {
  const { drawMode, setDrawMode, zone, setZone, iso, setIso, finishDraw } = useUi();
  const tool = TOOLS.find((t) => t.mode === drawMode);
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5" data-testid="draw-toolbar">
      <div className="flex gap-1 rounded-lg border bg-card p-1 shadow-md">
        {TOOLS.map(({ mode, label, icon: Icon }) => (
          <Button key={mode} size="sm" variant={drawMode === mode ? "default" : "ghost"} aria-pressed={drawMode === mode} onClick={() => setDrawMode(drawMode === mode ? null : mode)} title={label}>
            <Icon /> <span className="hidden xl:inline">{label}</span>
          </Button>
        ))}
        {zone && <Button size="sm" variant="ghost" onClick={() => setZone(null)} title="Effacer la zone"><Trash2 /></Button>}
      </div>
      {drawMode === "isochrone" && (
        <div className="flex items-center gap-2 rounded-lg border bg-card p-2 text-xs shadow-md">
          <select aria-label="Mode de déplacement" value={iso.mode} onChange={(e) => setIso({ ...iso, mode: e.target.value as "pedestrian" | "car" })} className="h-7 rounded border bg-card px-1">
            <option value="pedestrian">À pied</option><option value="car">En voiture</option>
          </select>
          <select aria-label="Durée" value={iso.minutes} onChange={(e) => setIso({ ...iso, minutes: Number(e.target.value) })} className="h-7 rounded border bg-card px-1">
            {[5, 10, 15, 20, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
      )}
      {tool && (
        <div className="flex max-w-xs items-center gap-2 rounded-lg border bg-card p-2 text-xs shadow-md">
          <span className="text-muted-foreground">{tool.hint}</span>
          {drawMode === "polygon" && <Button size="sm" onClick={finishDraw}><Check /> Terminer</Button>}
        </div>
      )}
    </div>
  );
}
