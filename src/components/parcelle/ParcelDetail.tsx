"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, ExternalLink, Flame, Landmark, Loader2, MapPin, ShieldAlert, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DPE_COLORS } from "@/config/layers";
import { MailDialog } from "@/components/courriers/MailDialog";
import { crm, useCrmMutation, useLeadByIdu, useUsers } from "@/components/crm/hooks";
import { STAGES } from "@/lib/crm/types";
import { aerialBBox, aerialUrl, projectRings } from "@/lib/parcelle/geo";
import { fmtDate, fmtEur, fmtM2 } from "@/lib/parcelle/format";
import type { Building, BusinessReport, EnergyReport, EnvReport, OwnerReport, ParcelBase, RentReport, RiskReport, SalesReport, Synthese, UrbanReport } from "@/lib/parcelle/types";

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  return (await r.json()) as T;
}

function useSection<T>(idu: string, section: string, qs = "", enabled = true) {
  return useQuery({ queryKey: ["parcelle", idu, section, qs], queryFn: () => getJson<T>(`/api/parcelle/${idu}/${section}${qs ? `?${qs}` : ""}`), enabled });
}

function State({ q, children }: { q: { isLoading: boolean; error: unknown }; children: React.ReactNode }) {
  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Chargement…</p>;
  if (q.error) return <p className="text-sm text-destructive">Impossible de charger cette section ({(q.error as Error).message}).</p>;
  return <>{children}</>;
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-0">
    <dt className="text-muted-foreground">{k}</dt>
    <dd className="text-right font-medium">{v}</dd>
  </div>
);

export function DpeChip({ label }: { label: string }) {
  const c = DPE_COLORS[label as keyof typeof DPE_COLORS] ?? "#98a2b3";
  return <span className="inline-grid size-6 place-items-center rounded text-xs font-bold text-black" style={{ background: c }}>{label}</span>;
}

// ───────────────────────── Synthèse ─────────────────────────
function Aerial({ base }: { base: ParcelBase }) {
  const W = 640, H = 400;
  const bb = aerialBBox(base.bbox, W, H);
  const rings = projectRings(base.geometry, bb, W, H);
  return (
    <div className="relative overflow-hidden rounded-lg border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={aerialUrl(bb, W, H)} alt="Photo aérienne de la parcelle" className="block w-full" width={W} height={H} loading="lazy" />
      <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 size-full" aria-hidden>
        {rings.map((d, i) => <path key={i} d={d} fill="rgba(109,74,255,0.25)" stroke="#6d4aff" strokeWidth="2.5" />)}
      </svg>
      <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[10px] text-white">© IGN</span>
    </div>
  );
}

function ScoreGauge({ s }: { s: NonNullable<Synthese["score"]> }) {
  const color = s.value >= 70 ? "#c1121f" : s.value >= 40 ? "#f4a261" : "#8ab17d";
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-end justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Probabilité de vente</p>
        <p className="text-2xl font-bold" style={{ color }}>{s.value}<span className="text-sm text-muted-foreground">/100</span></p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${s.value}%`, background: color }} /></div>
      <ul className="mt-3 space-y-1 text-xs">
        {s.factors.map((f) => (
          <li key={f.label} className="flex justify-between gap-2"><span>{f.label}{f.detail ? <span className="text-muted-foreground"> — {f.detail}</span> : null}</span><span className={f.points >= 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}>{f.points > 0 ? "+" : ""}{f.points}</span></li>
        ))}
      </ul>
    </div>
  );
}

function SyntheseTab({ base }: { base: ParcelBase }) {
  const q = useSection<Synthese>(base.idu, "synthese");
  return (
    <div className="space-y-3">
      <Aerial base={base} />
      <div className="flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant="outline"><a href={base.links.streetView} target="_blank" rel="noreferrer"><MapPin /> Street View</a></Button>
        <Button asChild size="sm" variant="outline"><a href={base.links.geoportail} target="_blank" rel="noreferrer"><ExternalLink /> Géoportail</a></Button>
        <Button asChild size="sm" variant="outline"><a href={base.links.googleMaps} target="_blank" rel="noreferrer"><ExternalLink /> Maps</a></Button>
      </div>
      <State q={q}>
        {q.data && (
          <>
            {q.data.flags.length > 0 && <div className="flex flex-wrap gap-1.5">{q.data.flags.map((f) => <Badge key={f.key} variant="beacon">{f.label}</Badge>)}</div>}
            {q.data.score && <ScoreGauge s={q.data.score} />}
            <dl>{q.data.facts.map((f) => <Row key={f.label} k={f.label} v={f.value} />)}</dl>
            {q.data.mode === "live" && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">Zone non importée : les informations sont chargées à la demande depuis les APIs publiques (BDNB, DVF, GPU, ADEME…). Score et détections indisponibles.</p>}
          </>
        )}
      </State>
    </div>
  );
}

// ───────────────────────── Bâti ─────────────────────────
function BatiTab({ base }: { base: ParcelBase }) {
  const q = useSection<Building[]>(base.idu, "bati");
  return (
    <State q={q}>
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground">Aucun bâtiment rattaché à cette parcelle (BDNB).</p>}
      <ul className="space-y-2">
        {q.data?.map((b) => (
          <li key={b.id} className="rounded-lg border p-3">
            <p className="flex items-center gap-2 text-sm font-medium"><Building2 className="size-4" /> {b.usage ?? "Bâtiment"} {b.copro && <Badge variant="secondary">copropriété</Badge>}</p>
            <dl className="mt-1">
              <Row k="Année de construction" v={b.anneeConstruction ?? "—"} />
              <Row k="Emprise au sol" v={fmtM2(b.surfaceSol)} />
              <Row k="Logements" v={b.nbLogements ?? "—"} />
              <Row k="Niveaux" v={b.nbNiveaux ?? "—"} />
              <Row k="Hauteur" v={b.hauteur ? `${Math.round(b.hauteur)} m` : "—"} />
            </dl>
          </li>
        ))}
      </ul>
    </State>
  );
}

// ───────────────────────── Ventes ─────────────────────────
function Chart({ data }: { data: SalesReport["byYear"] }) {
  const pts = data.filter((d) => d.medianPrixM2);
  if (pts.length < 2) return <p className="text-xs text-muted-foreground">Pas assez de ventes pour tracer une évolution.</p>;
  const W = 360, H = 130, P = 28;
  const ys = pts.map((d) => d.medianPrixM2!);
  const [min, max] = [Math.min(...ys) * 0.95, Math.max(...ys) * 1.05];
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v: number) => H - P / 1.5 - ((v - min) / (max - min)) * (H - P * 1.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Évolution du prix médian au m²">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" points={pts.map((d, i) => `${x(i)},${y(d.medianPrixM2!)}`).join(" ")} />
      {pts.map((d, i) => (
        <g key={d.year}>
          <circle cx={x(i)} cy={y(d.medianPrixM2!)} r="3" className="fill-beacon" />
          <text x={x(i)} y={H - 4} textAnchor="middle" className="fill-muted-foreground" fontSize="9">{d.year}</text>
          <text x={x(i)} y={y(d.medianPrixM2!) - 7} textAnchor="middle" className="fill-foreground" fontSize="9">{Math.round(d.medianPrixM2!).toLocaleString("fr-FR")}</text>
        </g>
      ))}
    </svg>
  );
}

function SalesTable({ rows }: { rows: SalesReport["parcel"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1">Date</th><th>Type</th><th className="text-right">Prix</th><th className="text-right">€/m²</th><th className="text-right">Surf.</th><th className="text-right">Dist.</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id + s.date} className="border-t">
              <td className="py-1">{fmtDate(s.date)}</td><td>{s.type?.replace("Local industriel. commercial ou assimilé", "Local pro")}</td>
              <td className="text-right">{fmtEur(s.valeur)}</td><td className="text-right">{s.prixM2 ? Math.round(s.prixM2).toLocaleString("fr-FR") : "—"}</td>
              <td className="text-right">{s.surfaceBati ? Math.round(s.surfaceBati) : "—"}</td><td className="text-right">{s.distance !== undefined ? `${Math.round(s.distance)} m` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VentesTab({ base }: { base: ParcelBase }) {
  const [radius, setRadius] = useState(500);
  const [type, setType] = useState("");
  const q = useSection<SalesReport>(base.idu, "ventes", `radius=${radius}${type ? `&type=${type}` : ""}`);
  return (
    <State q={q}>
      {q.data && (
        <div className="space-y-4">
          <section>
            <h3 className="mb-1 text-sm font-semibold">Ventes de la parcelle</h3>
            {q.data.parcel.length ? <SalesTable rows={q.data.parcel} /> : <p className="text-sm text-muted-foreground">Aucune vente enregistrée sur cette parcelle depuis juillet 2021 (DVF).</p>}
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Ventes comparables</h3>
              <div className="flex gap-1">
                <select aria-label="Rayon" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="rounded-md border bg-card px-1.5 py-1 text-xs">{[200, 500, 1000, 2000].map((r) => <option key={r} value={r}>{r} m</option>)}</select>
                <select aria-label="Type de bien" value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border bg-card px-1.5 py-1 text-xs"><option value="">Tous logements</option><option value="Maison">Maisons</option><option value="Appartement">Appartements</option><option value="Local industriel. commercial ou assimilé">Locaux d&apos;activité</option></select>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-2 text-center text-xs">
              {[["Ventes", String(q.data.stats.n)], ["Médiane €/m²", q.data.stats.medianPrixM2 ? q.data.stats.medianPrixM2.toLocaleString("fr-FR") : "—"], ["Q1–Q3", q.data.stats.p25 && q.data.stats.p75 ? `${q.data.stats.p25.toLocaleString("fr-FR")}–${q.data.stats.p75.toLocaleString("fr-FR")}` : "—"]].map(([k, v]) => (
                <div key={k} className="rounded-md border p-2"><p className="text-muted-foreground">{k}</p><p className="text-sm font-semibold">{v}</p></div>
              ))}
            </div>
            <Chart data={q.data.byYear} />
            <div className="mt-2 max-h-72 overflow-y-auto"><SalesTable rows={q.data.comparables.slice(0, 80)} /></div>
          </section>
        </div>
      )}
    </State>
  );
}

// ───────────────────────── Énergie ─────────────────────────
function EnergieTab({ base }: { base: ParcelBase }) {
  const q = useSection<EnergyReport>(base.idu, "energie");
  return (
    <State q={q}>
      {q.data && (
        <div className="space-y-3">
          {q.data.passoire ? (
            <div className="flex gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>Passoire thermique : au moins un DPE F ou G valide. Interdiction de location : G dès le 01/01/2025, F dès le 01/01/2028, E dès le 01/01/2034.</p>
            </div>
          ) : q.data.dpe.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun DPE rattaché à cette parcelle.</p>
          ) : null}
          <ul className="space-y-1.5">
            {q.data.dpe.map((d) => (
              <li key={d.numero} className="flex items-start gap-2 rounded-lg border p-2 text-xs">
                <DpeChip label={d.etiquette} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.type ?? d.kind} · {d.surface ? `${Math.round(d.surface)} m²` : "surface ?"}{d.conso ? ` · ${Math.round(d.conso)} kWh/m²/an` : ""}</p>
                  <p className="truncate text-muted-foreground">{d.adresse} · {fmtDate(d.date)}{d.ges ? ` · GES ${d.ges}` : ""}</p>
                  {d.banDate && <p className="text-red-600 dark:text-red-400">Interdiction de location : {fmtDate(d.banDate)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </State>
  );
}

// ───────────────────────── Urbanisme ─────────────────────────
function UrbanismeTab({ base }: { base: ParcelBase }) {
  const q = useSection<UrbanReport>(base.idu, "urbanisme");
  return (
    <State q={q}>
      {q.data && (
        <div className="space-y-4 text-sm">
          <section className="rounded-lg border p-3">
            <p className="flex items-center gap-2 font-medium"><Landmark className="size-4" /> Zonage</p>
            {q.data.zone ? (
              <>
                <p className="mt-1"><Badge>{q.data.zone.type ?? "?"}</Badge> <span className="font-medium">{q.data.zone.libelle}</span></p>
                <p className="mt-1 text-xs text-muted-foreground">{q.data.zone.libelong}</p>
                <div className="mt-2 flex gap-2">
                  {q.data.zone.url && <Button asChild size="sm" variant="outline"><a href={q.data.zone.url} target="_blank" rel="noreferrer"><ExternalLink /> Règlement</a></Button>}
                  <Button asChild size="sm" variant="outline"><a href={q.data.gpuUrl} target="_blank" rel="noreferrer"><ExternalLink /> Géoportail de l&apos;Urbanisme</a></Button>
                </div>
              </>
            ) : <p className="mt-1 text-muted-foreground">Aucun document d&apos;urbanisme numérisé (RNU ?). <a className="underline" href={q.data.gpuUrl} target="_blank" rel="noreferrer">Voir le GPU</a></p>}
          </section>
          {q.data.prescriptions.length > 0 && <section><h3 className="mb-1 font-semibold">Prescriptions</h3><ul className="list-disc space-y-1 pl-5 text-xs">{q.data.prescriptions.map((p, i) => <li key={i}>{p.libelle}</li>)}</ul></section>}
          {q.data.servitudes.length > 0 && <section><h3 className="mb-1 font-semibold">Servitudes d&apos;utilité publique</h3><ul className="list-disc space-y-1 pl-5 text-xs">{q.data.servitudes.map((s, i) => <li key={i}>{s.type}{s.fichier ? ` — ${s.fichier}` : ""}</li>)}</ul></section>}
          <section>
            <h3 className="mb-1 font-semibold">Permis sur la parcelle</h3>
            {q.data.permis.length ? <PermisList rows={q.data.permis} /> : <p className="text-xs text-muted-foreground">Aucune autorisation d&apos;urbanisme rattachée (Sitadel).</p>}
          </section>
          {q.data.permisProches.length > 0 && <section><h3 className="mb-1 font-semibold">Permis à proximité (300 m, 3 ans)</h3><PermisList rows={q.data.permisProches} /></section>}
        </div>
      )}
    </State>
  );
}
function PermisList({ rows }: { rows: { id: string; type: string | null; kind: string | null; date: string | null; logements: number | null; demandeur?: string | null; distance?: number }[] }) {
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((p) => (
        <li key={p.id} className="flex justify-between gap-2 rounded border px-2 py-1"><span>{p.type} · {p.kind} · {fmtDate(p.date)}{p.logements ? ` · ${p.logements} lgt` : ""}{p.demandeur ? ` · ${p.demandeur}` : ""}</span>{p.distance !== undefined && <span className="text-muted-foreground">{p.distance} m</span>}</li>
      ))}
    </ul>
  );
}

// ───────────────────────── Propriétaire ─────────────────────────
function ProprietaireTab({ base }: { base: ParcelBase }) {
  const q = useSection<OwnerReport>(base.idu, "proprietaire");
  const [mail, setMail] = useState(false);
  return (
    <State q={q}>
      {q.data && (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            {q.data.type === "personne_morale" ? "Personne morale" : q.data.type === "particulier" ? "Propriétaire particulier" : "Propriétaire non identifié"}
            {q.data.publicOwner && <Badge variant="secondary">public</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">{q.data.note}</p>
          {q.data.copro && <div className="rounded-lg border p-3 text-xs"><p className="font-medium">Copropriété immatriculée (RNIC)</p><p>{q.data.copro.nom ?? q.data.copro.numero} · {q.data.copro.lots ?? "?"} lots</p></div>}
          {q.data.entities.map((e) => (
            <div key={e.siren} className="space-y-1 rounded-lg border p-3 text-xs">
              <p className="text-sm font-semibold">{e.denomination}</p>
              <dl>
                <Row k="SIREN" v={<a className="underline" href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${e.siren}`} target="_blank" rel="noreferrer">{e.siren}</a>} />
                <Row k="Forme juridique" v={e.forme ?? "—"} />
                <Row k="Statut" v={e.etat ? `${e.etat}${e.fermeture ? ` (${fmtDate(e.fermeture)})` : ""}` : "—"} />
                <Row k="Création" v={fmtDate(e.creation)} />
                <Row k="Siège" v={e.siege ?? "—"} />
              </dl>
              {e.dirigeants && e.dirigeants.length > 0 && <div><p className="mt-1 font-medium">Dirigeants (RNE)</p><ul>{e.dirigeants.map((d, i) => <li key={i}>{d.nom}{d.qualite ? ` — ${d.qualite}` : ""}</li>)}</ul></div>}
              {e.annonces && e.annonces.length > 0 && <div><p className="mt-1 font-medium">BODACC</p><ul>{e.annonces.map((a, i) => <li key={i}>{fmtDate(a.date)} · {a.famille} · {a.type}</li>)}</ul></div>}
            </div>
          ))}
          <div className="rounded-lg bg-muted p-3 text-xs"><p className="font-medium">Destinataire du courrier</p><p>{q.data.courrier.destinataire}</p><p>{q.data.courrier.adresse}</p>{base.mode === "imported" && <Button size="sm" className="mt-2" onClick={() => setMail(true)}>Générer le courrier</Button>}</div>
          {mail && <MailDialog scope={{ idus: [base.idu] }} onClose={() => setMail(false)} />}
        </div>
      )}
    </State>
  );
}

// ───────────────────────── Risques ─────────────────────────
function RisquesTab({ base }: { base: ParcelBase }) {
  const q = useSection<RiskReport>(base.idu, "risques");
  return (
    <State q={q}>
      {q.data && (
        <div className="space-y-3 text-sm">
          {q.data.items.length === 0 && <p className="text-muted-foreground">Aucun risque remonté par Géorisques (ou service indisponible).</p>}
          <ul className="space-y-1.5">
            {q.data.items.map((r) => (
              <li key={r.label} className="rounded-lg border p-2 text-xs"><p className="flex items-center gap-1.5 font-medium"><ShieldAlert className="size-3.5" /> {r.label}</p>{r.level && <p>{r.level}</p>}{r.detail && <p className="text-muted-foreground">{r.detail}</p>}</li>
            ))}
          </ul>
          {q.data.icpe.length > 0 && <section><h3 className="mb-1 flex items-center gap-1.5 font-semibold"><Flame className="size-4" /> ICPE à moins d&apos;1 km</h3><ul className="list-disc space-y-0.5 pl-5 text-xs">{q.data.icpe.map((i, k) => <li key={k}>{i.nom}{i.regime ? ` (${i.regime})` : ""}</li>)}</ul></section>}
          <p className="text-[11px] text-muted-foreground">Source : Géorisques.</p>
        </div>
      )}
    </State>
  );
}

// ───────────────────────── Loyers ─────────────────────────
function LoyersTab({ base }: { base: ParcelBase }) {
  const [surface, setSurface] = useState(60);
  const [bien, setBien] = useState<"appartement" | "maison">("appartement");
  const [prix, setPrix] = useState("");
  const q = useSection<RentReport>(base.idu, "loyers", `surface=${surface}&bien=${bien}${prix ? `&prix=${prix}` : ""}`);
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs">Surface (m²)<Input type="number" min={5} value={surface} onChange={(e) => setSurface(Number(e.target.value) || 5)} /></label>
        <label className="text-xs">Bien<select value={bien} onChange={(e) => setBien(e.target.value as "appartement" | "maison")} className="h-9 w-full rounded-md border bg-card px-2 text-sm"><option value="appartement">Appartement</option><option value="maison">Maison</option></select></label>
        <label className="text-xs">Prix d&apos;achat (€)<Input type="number" min={1} value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="optionnel" /></label>
      </div>
      <State q={q}>
        {q.data && (
          <>
            {q.data.estimate ? (
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{fmtEur(q.data.estimate.loyerMensuel)}<span className="text-sm font-normal text-muted-foreground"> /mois</span></p>
                <p className="text-xs text-muted-foreground">{fmtEur(q.data.estimate.loyerAnnuel)}/an · {q.data.estimate.basis}</p>
                {q.data.estimate.rendementBrut !== null && <p className="mt-1 text-sm font-medium">Rendement brut estimé : {q.data.estimate.rendementBrut.toLocaleString("fr-FR")} %</p>}
              </div>
            ) : <p className="text-muted-foreground">Pas d&apos;indicateur de loyer pour cette commune.</p>}
            <dl>
              {q.data.commune.map((c) => <Row key={c.type} k={`Loyer ${c.type}`} v={c.loyerM2 ? `${c.loyerM2.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} €/m² (${c.min?.toFixed(1)}–${c.max?.toFixed(1)})` : "—"} />)}
              {q.data.vacance && <Row k="Vacance communale (parc privé)" v={q.data.vacance.taux !== null ? `${q.data.vacance.taux} %` : "secret statistique"} />}
            </dl>
            <p className="text-[11px] text-muted-foreground">Carte des loyers (annonces) : indicateur de commune, à utiliser comme ordre de grandeur.</p>
          </>
        )}
      </State>
    </div>
  );
}

// ───────────────────────── Environnement ─────────────────────────
function EnvTab({ base }: { base: ParcelBase }) {
  const q = useSection<EnvReport>(base.idu, "environnement", "radius=800");
  return (
    <State q={q}>
      {q.data && !q.data.available && <p className="text-sm text-muted-foreground">Service OpenStreetMap indisponible pour le moment.</p>}
      {q.data?.available && (
        <ul className="space-y-1.5 text-sm">
          {q.data.categories.map((c) => (
            <li key={c.key} className="flex justify-between rounded-lg border p-2 text-xs"><span className="flex items-center gap-1.5 font-medium"><Zap className="size-3.5" /> {c.label}</span><span>{c.count} à moins de {q.data!.radius} m{c.nearest ? ` · plus proche : ${c.nearest.name ?? "—"} (${c.nearest.distance} m)` : ""}</span></li>
          ))}
          <li className="text-[11px] text-muted-foreground">© contributeurs OpenStreetMap (ODbL).</li>
        </ul>
      )}
    </State>
  );
}

// ───────────────────────── Entreprise ─────────────────────────
function EntrepriseTab({ base }: { base: ParcelBase }) {
  const q = useSection<BusinessReport>(base.idu, "entreprise");
  return (
    <State q={q}>
      {q.data && (
        <div className="space-y-4 text-sm">
          <section>
            <h3 className="mb-1 font-semibold">Occupants à proximité ({q.data.radius} m)</h3>
            {q.data.occupants.length === 0 && <p className="text-xs text-muted-foreground">Aucun établissement actif trouvé (SIRENE).</p>}
            <ul className="space-y-1.5">
              {q.data.occupants.map((o) => (
                <li key={o.siret} className="rounded-lg border p-2 text-xs">
                  <p className="font-medium">{o.name} {o.isSiege && <Badge variant="secondary">siège</Badge>}</p>
                  <p className="text-muted-foreground">{o.adresse} · NAF {o.naf ?? "?"}{o.effectif ? ` · effectif ${o.effectif}` : ""}{o.since ? ` · depuis ${fmtDate(o.since)}` : ""}</p>
                  <a className="underline" href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${o.siren}`} target="_blank" rel="noreferrer">SIREN {o.siren}</a>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-1 font-semibold">DPE tertiaire</h3>
            {q.data.dpeTertiaire.length === 0 && <p className="text-xs text-muted-foreground">Aucun DPE tertiaire rattaché.</p>}
            <ul className="space-y-1.5">{q.data.dpeTertiaire.map((d) => <li key={d.numero} className="flex items-center gap-2 rounded-lg border p-2 text-xs"><DpeChip label={d.etiquette} /><span>{d.secteur ?? "tertiaire"}{d.surface ? ` · ${Math.round(d.surface)} m²` : ""} · {fmtDate(d.date)}</span></li>)}</ul>
          </section>
          <p className="text-xs text-muted-foreground">Transactions de locaux d&apos;activité : onglet Ventes → filtre « Locaux d&apos;activité ». Propriétaire : onglet Propriétaire (fichiers DGFiP des personnes morales).</p>
        </div>
      )}
    </State>
  );
}

// ───────────────────────── CRM ─────────────────────────
function CrmTab({ base }: { base: ParcelBase }) {
  const q = useLeadByIdu(base.idu);
  const users = useUsers();
  const add = useCrmMutation(() => crm.addLead(base.idu, { title: base.address ?? undefined }));
  const patch = useCrmMutation((b: Record<string, unknown>) => crm.patchLead(q.data!.lead!.id, b));
  const note = useCrmMutation((b: string) => crm.addNote(q.data!.lead!.id, b));
  const task = useCrmMutation((b: Record<string, unknown>) => crm.addTask({ ...b, leadId: q.data!.lead!.id }));
  const toggle = useCrmMutation((v: { id: string; done: boolean }) => crm.patchTask(v.id, { done: v.done }));
  const [n, setN] = useState("");
  const [t, setT] = useState({ title: "", dueAt: "" });
  return (
    <State q={q}>
      {!q.data?.lead ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">Ce bien n&apos;est pas encore suivi dans le CRM.</p>
          <Button onClick={() => add.mutate(undefined)} disabled={add.isPending}>Ajouter au CRM</Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>Étape<select className="h-8 w-full rounded-md border bg-card px-2" value={q.data.lead.stage} onChange={(e) => patch.mutate({ stage: e.target.value })}>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
            <label>Responsable<select className="h-8 w-full rounded-md border bg-card px-2" value={q.data.lead.assignedTo ?? ""} onChange={(e) => patch.mutate({ assignedTo: e.target.value || null })}><option value="">—</option>{users.data?.users.map((u) => <option key={u.email} value={u.email}>{u.email.split("@")[0]}</option>)}</select></label>
          </div>
          <section>
            <h3 className="mb-1 font-semibold">Tâches</h3>
            <ul className="space-y-1">{q.data.tasks.map((x) => <li key={x.id} className="flex items-center gap-2"><input type="checkbox" checked={x.done} onChange={(e) => toggle.mutate({ id: x.id, done: e.target.checked })} /><span className={x.done ? "text-muted-foreground line-through" : ""}>{x.title}</span>{x.dueAt && <span className="ml-auto text-xs text-muted-foreground">{fmtDate(x.dueAt)}</span>}</li>)}</ul>
            <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (t.title.trim()) { task.mutate({ title: t.title, dueAt: t.dueAt || undefined }); setT({ title: "", dueAt: "" }); } }}>
              <Input className="h-8 text-xs" placeholder="Rappel / tâche…" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
              <Input className="h-8 w-32 text-xs" type="date" value={t.dueAt} onChange={(e) => setT({ ...t, dueAt: e.target.value })} aria-label="Échéance" />
              <Button size="sm" type="submit">+</Button>
            </form>
          </section>
          <section>
            <h3 className="mb-1 font-semibold">Notes</h3>
            <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (n.trim()) { note.mutate(n); setN(""); } }}>
              <Input className="h-8 text-xs" placeholder="Ajouter une note…" value={n} onChange={(e) => setN(e.target.value)} /><Button size="sm" type="submit">Ajouter</Button>
            </form>
            <NotesList leadId={q.data.lead.id} />
          </section>
        </div>
      )}
    </State>
  );
}
function NotesList({ leadId }: { leadId: string }) {
  const q = useQuery({ queryKey: ["crm", "notes", leadId], queryFn: () => getJson<{ notes: { id: string; body: string; author: string | null; createdAt: number }[] }>(`/api/crm/leads/${leadId}/notes`).then((r) => r.notes) });
  return <ul className="mt-2 space-y-1.5 text-xs">{q.data?.map((x) => <li key={x.id} className="rounded border p-2"><p>{x.body}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{x.author?.split("@")[0]} · {new Date(x.createdAt * 1000).toLocaleString("fr-FR")}</p></li>)}</ul>;
}

// ───────────────────────── Fiche ─────────────────────────
const TABS = ["Synthèse", "Bâti", "Ventes", "Énergie", "Urbanisme", "Propriétaire", "Risques", "Loyers", "Environnement", "Entreprise", "CRM"] as const;

export function ParcelDetail({ idu, compact = false }: { idu: string; compact?: boolean }) {
  const base = useQuery({ queryKey: ["parcelle", idu, "base"], queryFn: () => getJson<ParcelBase>(`/api/parcelle/${idu}`) });
  const [tab, setTab] = useState<(typeof TABS)[number]>("Synthèse");
  if (base.isLoading) return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Chargement de la parcelle…</p>;
  if (base.error || !base.data) return <p className="p-4 text-sm text-destructive">Parcelle introuvable ({(base.error as Error | null)?.message ?? idu}).</p>;
  const b = base.data;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={compact ? "px-3 pt-1" : "pb-3"}>
        <p className="text-sm font-medium">{b.address ?? `${b.commune ?? b.insee} — ${b.section} ${b.numero}`}</p>
        <p className="text-xs text-muted-foreground">{b.commune} · {b.contenance ? fmtM2(b.contenance) : "surface ?"} · {b.mode === "imported" ? "données importées" : "à la demande"}</p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex min-h-0 flex-1 flex-col p-3">
        <TabsList className="h-auto flex-wrap">{TABS.map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}</TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="Synthèse"><SyntheseTab base={b} /></TabsContent>
          <TabsContent value="Bâti">{tab === "Bâti" && <BatiTab base={b} />}</TabsContent>
          <TabsContent value="Ventes">{tab === "Ventes" && <VentesTab base={b} />}</TabsContent>
          <TabsContent value="Énergie">{tab === "Énergie" && <EnergieTab base={b} />}</TabsContent>
          <TabsContent value="Urbanisme">{tab === "Urbanisme" && <UrbanismeTab base={b} />}</TabsContent>
          <TabsContent value="Propriétaire">{tab === "Propriétaire" && <ProprietaireTab base={b} />}</TabsContent>
          <TabsContent value="Risques">{tab === "Risques" && <RisquesTab base={b} />}</TabsContent>
          <TabsContent value="Loyers">{tab === "Loyers" && <LoyersTab base={b} />}</TabsContent>
          <TabsContent value="Environnement">{tab === "Environnement" && <EnvTab base={b} />}</TabsContent>
          <TabsContent value="Entreprise">{tab === "Entreprise" && <EntrepriseTab base={b} />}</TabsContent>
          <TabsContent value="CRM">{tab === "CRM" && <CrmTab base={b} />}</TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
