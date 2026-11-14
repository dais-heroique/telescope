/** Regroupement de parcelles contiguës (cadastre topologique : parcelles voisines = sommets communs). Pur et testé. */
export interface ClusterInput {
  id: string;
  /** Anneaux extérieurs (lon/lat) de la géométrie. */
  rings: number[][][];
}

const key = (p: number[]) => `${Math.round(p[0] * 1e6)}:${Math.round(p[1] * 1e6)}`;

/** Deux parcelles sont contiguës si elles partagent au moins 2 sommets (une frontière, pas un simple coin). */
export function clusterContiguous(items: ClusterInput[], minShared = 2): string[][] {
  const owners = new Map<string, Set<string>>();
  for (const it of items) for (const ring of it.rings) for (const p of ring) {
    const k = key(p);
    const s = owners.get(k) ?? new Set<string>();
    s.add(it.id);
    owners.set(k, s);
  }
  const shared = new Map<string, number>();
  for (const s of owners.values()) {
    if (s.size < 2) continue;
    const ids = [...s].sort();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) shared.set(`${ids[i]}|${ids[j]}`, (shared.get(`${ids[i]}|${ids[j]}`) ?? 0) + 1);
  }
  const parent = new Map(items.map((i) => [i.id, i.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const [pair, n] of shared) if (n >= minShared) {
    const [a, b] = pair.split("|");
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, string[]>();
  for (const it of items) groups.set(find(it.id), [...(groups.get(find(it.id)) ?? []), it.id]);
  return [...groups.values()].filter((g) => g.length >= 2);
}

/** Surface de plancher indicative = surface × emprise × niveaux × rendement. */
export function indicativeFloorArea(surface: number, p: { emprise: number; niveaux: number; rendementSurfacePlancher: number }) {
  return Math.round(surface * p.emprise * p.niveaux * p.rendementSurfacePlancher);
}
