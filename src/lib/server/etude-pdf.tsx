import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Etude } from "@/lib/etude-types";
import type { AgencySettings } from "./letters";

const st = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 9.5, color: "#111" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { color: "#555", marginBottom: 14 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6, color: "#10294a" },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 4 },
  kpi: { flex: 1, border: "1pt solid #dde2ea", borderRadius: 4, padding: 8 },
  kpiV: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  lbl: { width: 110 },
  barBox: { flex: 1, height: 9, backgroundColor: "#eef1f5" },
  bar: { height: 9, backgroundColor: "#6d4aff" },
  val: { width: 90, textAlign: "right" },
  th: { fontFamily: "Helvetica-Bold", color: "#555" },
  foot: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#777" },
});

const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("fr-FR"));

function Bars({ rows }: { rows: { label: string; v: number; text: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={st.row}>
          <Text style={st.lbl}>{r.label}</Text>
          <View style={st.barBox}><View style={{ ...st.bar, width: `${(r.v / max) * 100}%` }} /></View>
          <Text style={st.val}>{r.text}</Text>
        </View>
      ))}
    </View>
  );
}

export async function renderEtudePdf(e: Etude, s: AgencySettings): Promise<Buffer> {
  const maxPrice = (k: "maison" | "appartement") => e.transactions.byYear.map((y) => ({ label: String(y.year), v: y[k].median ?? 0, text: y[k].median ? `${n(y[k].median)} €/m² (${y[k].n})` : "—" }));
  return renderToBuffer(
    <Document title={`Étude de zone — ${e.label}`} author={s.agence || "VIGIE"}>
      <Page size="A4" style={st.page}>
        <Text style={st.h1}>Étude de marché — {e.label}</Text>
        <Text style={st.sub}>{s.agence ? `${s.agence} · ` : ""}édité le {new Date(e.generatedAt).toLocaleDateString("fr-FR")}</Text>
        <View style={st.kpis}>
          <View style={st.kpi}><Text style={st.kpiV}>{n(e.transactions.total)}</Text><Text>ventes (DVF)</Text></View>
          <View style={st.kpi}><Text style={st.kpiV}>{n(e.parcelles.baties)}</Text><Text>parcelles bâties</Text></View>
          <View style={st.kpi}><Text style={st.kpiV}>{n(e.permis.total)}</Text><Text>autorisations d&apos;urbanisme</Text></View>
          {e.population && <View style={st.kpi}><Text style={st.kpiV}>{n(e.population.population)}</Text><Text>habitants{e.population.densite ? ` · ${n(e.population.densite)} hab/km²` : ""}</Text></View>}
        </View>

        <Text style={st.h2}>Prix médian au m² — maisons</Text>
        <Bars rows={maxPrice("maison")} />
        <Text style={st.h2}>Prix médian au m² — appartements</Text>
        <Bars rows={maxPrice("appartement")} />

        <Text style={st.h2}>Durée de détention (parcelles bâties)</Text>
        <Bars rows={e.detention.map((d) => ({ label: d.label, v: d.n, text: n(d.n) }))} />
        <Text style={st.h2}>Étiquettes DPE (dernier diagnostic par parcelle)</Text>
        <Bars rows={e.dpe.map((d) => ({ label: d.label, v: d.n, text: n(d.n) }))} />
        <Text style={st.h2}>Autorisations d&apos;urbanisme par année</Text>
        <Bars rows={e.permis.byYear.map((p) => ({ label: String(p.year), v: p.n, text: `${n(p.n)} · ${n(p.logements)} lgt` }))} />
        {e.social?.logements != null && <Text style={{ marginTop: 10 }}>Parc locatif social (RPLS) : {n(e.social.logements)} logements.</Text>}
        {e.notes.map((t, i) => <Text key={i} style={{ marginTop: 3, color: "#666" }}>• {t}</Text>)}
        <Text style={st.foot} fixed>Sources : DVF (Etalab), BDNB (CSTB), ADEME, Sitadel (SDES), RPLS, geo.api.gouv.fr — Licence Ouverte 2.0.</Text>
      </Page>
    </Document>,
  );
}
