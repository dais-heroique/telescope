"use client";

import { RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MODULES } from "@/config/modules";
import { DPE_COLORS } from "@/config/layers";
import { DPE_LABELS, FLAGS, PLU_TYPES, USAGES, USAGE_LABELS, type Filters } from "@/lib/filters";
import { useUi } from "@/lib/store";

type Range = [number | null, number | null] | undefined;

function RangeField({ label, value, onChange, unit, step }: { label: string; value: Range; onChange: (v: Range) => void; unit?: string; step?: number }) {
  const set = (i: 0 | 1, raw: string) => {
    const n = raw === "" ? null : Number(raw);
    const next: [number | null, number | null] = [...(value ?? [null, null])] as [number | null, number | null];
    next[i] = n === null || Number.isNaN(n) ? null : n;
    onChange(next[0] === null && next[1] === null ? undefined : next);
  };
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}{unit ? ` (${unit})` : ""}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <Input type="number" step={step} inputMode="decimal" placeholder="min" aria-label={`${label} min`} value={value?.[0] ?? ""} onChange={(e) => set(0, e.target.value)} className="h-8 text-xs" />
        <Input type="number" step={step} inputMode="decimal" placeholder="max" aria-label={`${label} max`} value={value?.[1] ?? ""} onChange={(e) => set(1, e.target.value)} className="h-8 text-xs" />
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

export function FiltersPanel() {
  const { filters, setFilters, module } = useUi();
  const set = <K extends keyof Filters>(k: K, v: Filters[K] | undefined) => {
    const next = { ...filters } as Record<string, unknown>;
    if (v === undefined || v === "") delete next[k];
    else next[k] = v;
    setFilters(next as Filters);
  };
  const active = Object.keys(filters).length;
  const sel = "h-8 w-full rounded-md border bg-card px-2 text-xs";

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raccourcis · {MODULES[module].label}</p>
        <div className="flex flex-wrap gap-1.5">
          {MODULES[module].quickFilters.map((q) => (
            <button key={q.label} onClick={() => setFilters(q.filters)} className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent">{q.label}</button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtres {active > 0 && `(${active})`}</p>
        <Button size="sm" variant="ghost" disabled={!active} onClick={() => setFilters({})}><RotateCcw /> Réinitialiser</Button>
      </div>

      <Chips label="Type de bien" options={USAGES} value={filters.usages as (typeof USAGES)[number][] | undefined} onChange={(v) => set("usages", v)} render={(o) => USAGE_LABELS[o] ?? o} />
      <Chips label="Détections" options={FLAGS} value={filters.flags} onChange={(v) => set("flags", v)} render={(o) => FLAG_LABELS[o]} />
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Score de vente minimum : <strong>{filters.scoreMin ?? 0}</strong></p>
        <input type="range" min={0} max={90} step={5} value={filters.scoreMin ?? 0} onChange={(e) => set("scoreMin", Number(e.target.value) || undefined)} className="w-full accent-[var(--beacon)]" aria-label="Score minimum" />
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
        <label className="text-xs text-muted-foreground">Nom du propriétaire<Input className="h-8 text-xs" placeholder="ex. SCI Les…" value={filters.pmNom ?? ""} onChange={(e) => set("pmNom", e.target.value.length >= 2 ? e.target.value : undefined)} /></label>
        <label className="text-xs text-muted-foreground">Forme juridique<Input className="h-8 text-xs" placeholder="ex. SCI" value={filters.pmForme ?? ""} onChange={(e) => set("pmForme", e.target.value.length >= 2 ? e.target.value : undefined)} /></label>
      </div>
    </div>
  );
}
