import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { toParagraphs } from "@/lib/mail/render";
import type { AgencySettings, Recipient } from "./letters";

const st = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 56, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.45, color: "#111" },
  head: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  sender: { fontSize: 9, color: "#444", maxWidth: 240 },
  logo: { height: 40, objectFit: "contain" },
  to: { marginLeft: "auto", width: 230, marginBottom: 24 },
  date: { textAlign: "right", marginBottom: 18, fontSize: 9.5, color: "#444" },
  subject: { fontFamily: "Helvetica-Bold", marginBottom: 14 },
  p: { marginBottom: 9 },
});

export interface PdfLetter { recipient: Recipient; subject: string; body: string; date: string }

/** Un PDF, une page par lettre (une lettre par destinataire). */
export async function renderLettersPdf(letters: PdfLetter[], s: AgencySettings): Promise<Buffer> {
  const doc = (
    <Document title="Courriers VIGIE" author={s.agence || "VIGIE"}>
      {letters.map((l) => (
        <Page key={l.recipient.idu} size="A4" style={st.page}>
          <View style={st.head}>
            <View>{s.logo ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- composant react-pdf (pas un <img> HTML)
                <Image src={s.logo} style={st.logo} />
              ) : <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13 }}>{s.agence}</Text>}</View>
            <Text style={st.sender}>{s.expediteur || [s.agence, s.agent].filter(Boolean).join("\n")}</Text>
          </View>
          <View style={st.to}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{l.recipient.destinataire}</Text>
            <Text>{l.recipient.ligneAdresse}</Text>
          </View>
          <Text style={st.date}>{l.date}</Text>
          {l.subject ? <Text style={st.subject}>Objet : {l.subject}</Text> : null}
          {toParagraphs(l.body).map((p, i) => (
            <Text key={i} style={st.p}>{p}</Text>
          ))}
        </Page>
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}
