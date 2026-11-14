"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Landmark, MapPin, Search, SquareDashed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUi } from "@/lib/store";
import type { GeocodeHit } from "@/app/api/geocode/route";

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const ICONS = { address: MapPin, municipality: Landmark, parcel: SquareDashed } as const;

export function AddressSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q.trim());
  const ref = useRef<HTMLDivElement>(null);
  const fly = useUi((s) => s.fly);
  const select = useUi((s) => s.select);

  const { data, isFetching } = useQuery({
    queryKey: ["geocode", dq],
    enabled: dq.length >= 3,
    queryFn: async ({ signal }) => {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(dq)}`, { signal });
      return ((await r.json()) as { hits: GeocodeHit[] }).hits;
    },
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(h: GeocodeHit) {
    fly(h.lng, h.lat, h.zoom);
    if (h.kind === "parcel" && h.idu) select({ idu: h.idu });
    setQ(h.label);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && data?.[0] && pick(data[0])}
        placeholder="Adresse, commune ou parcelle…"
        title="Ex. : 12 rue de la Paix Annecy · Annecy · 74010 000 AB 0123"
        className="pl-8"
        aria-label="Rechercher une adresse, une commune ou une parcelle"
        role="combobox"
        aria-expanded={open}
        data-testid="search-input"
      />
      {open && dq.length >= 3 && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-lg" role="listbox">
          {isFetching && !data && <li className="px-3 py-2 text-muted-foreground">Recherche…</li>}
          {data?.length === 0 && <li className="px-3 py-2 text-muted-foreground">Aucun résultat</li>}
          {data?.map((h, i) => {
            const Icon = ICONS[h.kind] ?? Building2;
            return (
              <li key={i} role="option" aria-selected={false}>
                <button className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent" onClick={() => pick(h)}>
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block font-medium">{h.label}</span>
                    {h.context && <span className="block text-xs text-muted-foreground">{h.context}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
