"use client";

import { Layers, Map as MapIcon, Satellite, SquareDashed } from "lucide-react";
import { AddressSearch } from "./AddressSearch";
import { FiltersPanel } from "./FiltersPanel";
import { ResultsPanel } from "./ResultsPanel";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { LAYERS, LAYER_GROUPS, type LayerDef } from "@/config/layers";
import { MODULES } from "@/config/modules";
import { useUi, type Basemap } from "@/lib/store";
import { ANCIENNETE_BINS, PRIX_BINS } from "@/config/layers";

const BASEMAPS: { id: Basemap; label: string; icon: typeof MapIcon }[] = [
  { id: "plan", label: "Plan", icon: MapIcon },
  { id: "satellite", label: "Satellite", icon: Satellite },
  { id: "cadastre", label: "Cadastre", icon: SquareDashed },
];

export function LeftPanel() {
  const { module, basemap, setBasemap, layers, toggleLayer, dvfColor, setDvfColor, leftTab, setLeftTab, filters, zone, resultOpacity, setResultOpacity } = useUi();
  const nFilters = Object.keys(filters).length;
  const groups = Object.entries(LAYER_GROUPS).map(([g, label]) => ({
    g,
    label,
    items: LAYERS.filter((l) => l.group === g),
  }));
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-hidden border-r bg-card p-3" aria-label="Recherche, calques, filtres et résultats">
      <AddressSearch />
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs font-medium">
        {([["calques", "Calques"], ["filtres", `Filtres${nFilters ? ` (${nFilters})` : ""}`], ["resultats", zone ? "Résultats · zone" : "Résultats"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={leftTab === k} onClick={() => setLeftTab(k)} className={`rounded-md px-2 py-1 transition-colors ${leftTab === k ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>
      {leftTab === "filtres" && <FiltersPanel />}
      {leftTab === "resultats" && <ResultsPanel />}
      {leftTab === "calques" && (
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      <section>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Module · {MODULES[module].label}</p>
        <p className="text-xs text-muted-foreground">{MODULES[module].description}</p>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fond de carte</p>
        <div className="grid grid-cols-3 gap-1">
          {BASEMAPS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setBasemap(id)}
              aria-pressed={basemap === id}
              className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                basemap === id ? "border-beacon bg-accent font-medium" : "hover:bg-accent"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="result-opacity" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opacité des résultats</label>
          <span className="text-xs tabular-nums text-muted-foreground">{Math.round(resultOpacity * 100)} %</span>
        </div>
        <input
          id="result-opacity" type="range" min={10} max={100} step={5} value={Math.round(resultOpacity * 100)}
          onChange={(e) => setResultOpacity(Number(e.target.value) / 100)}
          className="w-full accent-[var(--beacon)]" aria-label="Opacité des résultats sur la carte" data-testid="result-opacity"
        />
        <p className="mt-0.5 text-[11px] text-muted-foreground">Rend les couleurs, points et surlignages plus ou moins transparents (utile pour une capture d&apos;écran).</p>
      </section>

      <section className="space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Layers className="size-3.5" /> Calques
        </p>
        {groups
          .filter((g) => g.items.length)
          .map((g) => (
            <div key={g.g}>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">{g.label}</p>
              <ul className="space-y-1">
                {g.items.map((l) => (
                  <LayerRow key={l.id} layer={l} on={Boolean(layers[l.id])} onToggle={() => toggleLayer(l.id)}>
                    {l.id === "dvf" && layers.dvf && (
                      <div className="ml-2 mt-1 space-y-1">
                        <div className="flex gap-1 text-[11px]">
                          {(["prix", "anciennete"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setDvfColor(m)}
                              aria-pressed={dvfColor === m}
                              className={`rounded px-1.5 py-0.5 ${dvfColor === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                            >
                              {m === "prix" ? "Prix/m²" : "Ancienneté"}
                            </button>
                          ))}
                        </div>
                        <Legend entries={dvfColor === "prix" ? PRIX_BINS : ANCIENNETE_BINS} />
                      </div>
                    )}
                  </LayerRow>
                ))}
              </ul>
            </div>
          ))}
      </section>
      </div>
      )}
    </aside>
  );
}

function Legend({ entries }: { entries: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {entries.map((e) => (
        <span key={e.label} className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: e.color }} />
          {e.label}
        </span>
      ))}
    </div>
  );
}

function LayerRow({ layer, on, onToggle, children }: { layer: LayerDef; on: boolean; onToggle: () => void; children?: React.ReactNode }) {
  const disabled = layer.status === "planned";
  return (
    <li>
      <label className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm ${disabled ? "opacity-60" : "cursor-pointer hover:bg-accent"}`}>
        <span className="flex items-center gap-2">
          {layer.label}
          {layer.status === "imported" && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              import
            </Badge>
          )}
        </span>
        <Switch checked={on && !disabled} onCheckedChange={onToggle} disabled={disabled} aria-label={layer.label} />
      </label>
      {on && !disabled && layer.legend && (
        <div className="ml-2 mt-1">
          <Legend entries={layer.legend} />
        </div>
      )}
      {on && !disabled && layer.hint && <p className="ml-2 mt-1 text-[11px] leading-snug text-muted-foreground">{layer.hint}</p>}
      {children}
    </li>
  );
}
