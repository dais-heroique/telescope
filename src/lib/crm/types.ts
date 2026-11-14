export const STAGES = [
  { key: "a_prospecter", label: "À prospecter" },
  { key: "contacte", label: "Contacté" },
  { key: "rdv", label: "RDV" },
  { key: "estimation", label: "Estimation" },
  { key: "mandat", label: "Mandat" },
  { key: "vendu", label: "Vendu" },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as [StageKey, ...StageKey[]];

export interface Lead {
  id: string;
  idu: string;
  title: string | null;
  stage: StageKey;
  contactId: string | null;
  contactName: string | null;
  assignedTo: string | null;
  value: number | null;
  updatedAt: number;
  adresse: string | null;
  score: number | null;
  contenance: number | null;
  lon: number | null;
  lat: number | null;
  nbTasks: number;
}
export interface Task { id: string; leadId: string | null; leadTitle: string | null; leadIdu: string | null; title: string; dueAt: string | null; done: boolean; assignedTo: string | null }
export interface Note { id: string; body: string; author: string | null; createdAt: number }
export interface Contact { id: string; name: string; kind: string; email: string | null; phone: string | null; address: string | null; notes: string | null; nbLeads: number }
export interface Sector { id: string; name: string; polygon: GeoJSON.Polygon; assignedTo: string | null; color: string }
export interface Activity { id: number; leadId: string | null; kind: string; text: string; author: string | null; at: number }
