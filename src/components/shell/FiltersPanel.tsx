"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DPE_COLORS } from "@/config/layers";
import { MODULES } from "@/config/modules";
import { DPE_LABELS, FLAGS, PLU_TYPES, USAGES, USAGE_LABELS, type Filters } from "@/lib/filters";
import { useUi } from "@/lib/store";
import { useSearchResults } from "./ResultsPanel";

type Range = [number | null, number | null] | undefined;

/**
 * Champ qui s'applique à la carte sur ENTRÉE (ou quand on le quitte) : pas de rechargement à chaque frappe.
 */
function CommitInput({ value, onCommit, className, ...rest }: { value: string; onCommit: (v: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(v);
  return (
    <Input
      {...rest}
      value={v}
      className={className}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function RangeField({ label, value, onChange, unit }: { label: string; value: Range; onChange: (v: Range) => void; unit?: string }) {
  const set = (i: 0 | 1, raw: string) => {
    const n = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    const next: [number | null, number | null] = [...(value ?? [null, null])] as [number | null, number | null];
    next[i] = n === null || Number.isNaN(n) ? null : n;
    onChange(next[0] === null && next[1] === null ? undefined : next);
  };
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}{unit ? ` (${unit})` : ""}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <CommitInput inputMode="decimal" placeholder="min" aria-label={`${label} min`} value={value?.[0]?.toString() ?? ""} onCommit={(v) => set(0, v)} className="h-8 text-xs" />
        <CommitInput inputMode="decimal" placeholder="max" aria-label={`${label} max`} value={value?.[1]?.toString() ?? ""} onCommit={(v) => set(1, v)} className="h-8 text-xs" />
      </div>
    </div>
  );
}

function Chips<T extends string>({ label, options, value, onChange, render }: { label: string; options: readonly T[]; value: T[] | undefined; onChange: (v: T[] | undefined) => void; render?: (o: T) => React.ReactNode }) {
  const sel = new Set(value ?? []);
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={sel.has(o)}
            onClick={() => {
              const n = new Set(sel);
              if (n.has(o)) n.delete(o);
              else n.add(o);
              onChange(n.size ? [...n] : undefined);
            }}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${sel.has(o) ? "border-beacon bg-beacon text-beacon-foreground" : "hover:bg-accent"}`}
          >
            {render ? render(o) : o}
          </button>
        ))}
      </div>
    </div>
  );
}

const FLAG_LABELS: Record<(typeof FLAGS)[number], string> = { passoire: "Passoire F/G", divisible: "À diviser", monopropriete: "Monopropriété", dent_creuse: "Dent creuse" };
const sameFilters = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b);

export function FiltersPanel() {
  const { filters, setFilters, module, setLeftTab, viewport, zone } = useUi();
  const { query, scope } = useSearchResults();
  const set = <K extends keyof Filters>(k: K, v: Filters[K] | undefined) => {
    const next = { ...filters } as Record<string, unknown>;
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
    setFilters(next as Filters);
  };
  const active = Object.keys(filters).length;
  const sel = "h-8 w-full rounded-md border bg-card px-2 text-xs";
  const [scoreDraft, setScoreDraft] = useState(filters.scoreMin ?? 0);
  useEffect(() => setScoreDraft(filters.scoreMin ?? 0), [filters.scoreMin]);
  const lowZoom = !zone && (viewport?.zoom ?? 0) < 14;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" onSubmit={(e) => e.preventDefault()}>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raccourcis · {MODULES[module].label}</p>
          <div className="flex flex-wrap gap-1.5">
            {MODULES[module].quickFilters.map((q) => {
              const on = sameFilters(filters, q.filters);
              return (
                <button key={q.label} type="button" aria-pressed={on} onClick={() => setFilters(on ? {} : q.filters)} className={`rounded-md border px-2 py-1 text-xs ${on ? "border-beacon bg-beacon text-beacon-foreground" : "bg-card hover:bg-accent"}`}>
                  {q.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtres {active > 0 && `(${active})`}</p>
          <Button size="sm" variant="ghost" type="button" disabled={!active} onClick={() => setFilters({})}><RotateCcw /> Réinitialiser</Button>
        </div>
        <p className="-mt-2 text-[11px] text-muted-foreground">Tapez une valeur puis <kbd className="rounded border px-1">Entrée</kbd> : les biens correspondants s&apos;affichent sur la carte.</p>

        <Chips label="Type de bien" options={USAGES} value={filters.usages as (typeof USAGES)[number][] | undefined} onChange={(v) => set("usages", v)} render={(o) => USAGE_LABELS[o] ?? o} />
        <Chips label="Détections" options={FLAGS} value={filters.flags} onChange={(v) => set("flags", v)} render={(o) => FLAG_LABELS[o]} />
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Score de vente minimum : <strong>{scoreDraft}</strong></p>
          <input
            type="range" min={0} max={90} step={5} value={scoreDraft} aria-label="Score minimum" className="w-full accent-[var(--beacon)]"
            onChange={(e) => setScoreDraft(Number(e.target.value))}
            onPointerUp={() => set("scoreMin", scoreDraft || undefined)}
            onKeyUp={() => set("scoreMin", scoreDraft || undefined)}
          />
        </div>
        <RangeField label="Surface parcelle" unit="m²" value={filters.surfParcelle} onChange={(v) => set("surfParcelle", v)} />
        <RangeField label="Emprise bâtie" unit="m²" value={filters.emprise} onChange={(v) => set("emprise", v)} />
        <RangeField label="Surface libre" unit="m²" value={filters.surfLibre} onChange={(v) => set("surfLibre", v)} />
        <RangeField label="Prix dernière vente" unit="€" value={filters.prix} onChange={(v) => set("prix", v)} />
        <RangeField label="Prix au m²" unit="€/m²" value={filters.prixM2} onChange={(v) => set("prixM2", v)} />
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Date de dernière vente</p>
          <div className="grid grid-cols-2 gap-1.5">
            <Input type="date" aria-label="Vendu après" value={filters.venduApres ?? ""} onChange={(e) => set("venduApres", e.target.value || undefined)} className="h-8 text-xs" />
            <Input type="date" aria-label="Vendu avant" value={filters.venduAvant ?? ""} onChange={(e) => set("venduAvant", e.target.value || undefined)} className="h-8 text-xs" />
          </div>
        </div>
        <RangeField label="Durée de détention" unit="ans" value={filters.detention} onChange={(v) => set("detention", v)} />
        <Chips label="Étiquette DPE" options={DPE_LABELS} value={filters.dpe} onChange={(v) => set("dpe", v)} render={(o) => <span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-full" style={{ background: DPE_COLORS[o] }} />{o}</span>} />
        <Chips label="Zone PLU" options={PLU_TYPES} value={filters.plu} onChange={(v) => set("plu", v)} />
        <RangeField label="Année de construction" value={filters.annee} onChange={(v) => set("annee", v)} />
        <RangeField label="Nombre de logements" value={filters.logements} onChange={(v) => set("logements", v)} />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">Personne morale
            <select className={sel} value={filters.pm ?? ""} onChange={(e) => set("pm", (e.target.value || undefined) as Filters["pm"])}>
              <option value="">Indifférent</option><option value="societes">Sociétés privées</option><option value="oui">Toutes (y c. public)</option><option value="non">Aucune</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Copropriété
            <select className={sel} value={filters.copro ?? ""} onChange={(e) => set("copro", (e.target.value || undefined) as Filters["copro"])}>
              <option value="">Indifférent</option><option value="oui">Oui</option><option value="non">Non</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">Nom du propriétaire<CommitInput className="h-8 text-xs" placeholder="ex. SCI Les…" value={filters.pmNom ?? ""} onCommit={(v) => set("pmNom", v.trim().length >= 2 ? v.trim() : undefined)} /></label>
          <label className="text-xs text-muted-foreground">Forme juridique<CommitInput className="h-8 text-xs" placeholder="ex. SCI" value={filters.pmForme ?? ""} onCommit={(v) => set("pmForme", v.trim().length >= 2 ? v.trim() : undefined)} /></label>
        </div>
      </form>

      {active > 0 && (
        <div className="mt-2 space-y-1.5 rounded-lg border bg-muted/60 p-2 text-xs">
          {lowZoom ? (
            <p>Les biens correspondants apparaissent sur la carte à partir du zoom 14 (surlignés en violet). <button type="button" className="font-medium underline" onClick={() => viewport && useUi.getState().fly((viewport.bbox[0] + viewport.bbox[2]) / 2, (viewport.bbox[1] + viewport.bbox[3]) / 2, 14.5)}>Zoomer ici</button></p>
          ) : (
            <p>
              <strong>{scope ? (query.data?.tooWide ? "Zone trop large" : `${query.data?.total ?? "…"}${query.data?.truncated ? "+" : ""} bien(s)`) : "—"}</strong> {zone ? "dans la zone" : "dans la vue"}, surlignés en violet sur la carte. Les points de ventes, permis et copropriétés ne montrent que ceux de ces biens.
            </p>
          )}
          <Button size="sm" type="button" variant="outline" className="w-full" onClick={() => setLeftTab("resultats")}>Voir la liste</Button>
        </div>
      )}
    </div>
  );
}
