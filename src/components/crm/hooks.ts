"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Activity, Contact, Lead, Note, Sector, Task } from "@/lib/crm/types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  return (await r.json()) as T;
}
const send = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const useLeads = () => useQuery({ queryKey: ["crm", "leads"], queryFn: () => api<{ leads: Lead[] }>("/api/crm/leads").then((r) => r.leads) });
export const useTasks = (qs = "") => useQuery({ queryKey: ["crm", "tasks", qs], queryFn: () => api<{ tasks: Task[] }>(`/api/crm/tasks${qs}`).then((r) => r.tasks) });
export const useContacts = () => useQuery({ queryKey: ["crm", "contacts"], queryFn: () => api<{ contacts: Contact[] }>("/api/crm/contacts").then((r) => r.contacts) });
export const useSectors = () => useQuery({ queryKey: ["crm", "sectors"], queryFn: () => api<{ sectors: Sector[] }>("/api/crm/sectors").then((r) => r.sectors) });
export const useUsers = () => useQuery({ queryKey: ["crm", "users"], queryFn: () => api<{ me: string; users: { email: string; name: string | null }[] }>("/api/crm/users"), staleTime: 300_000 });
export const useDashboard = () =>
  useQuery({ queryKey: ["crm", "dashboard"], queryFn: () => api<{ byStage: Record<string, number>; byAgent: { agent: string | null; leads: number; won: number }[]; tasks: { open: number; overdue: number }; activity: Activity[] }>("/api/crm/dashboard") });
export const useLeadByIdu = (idu: string) =>
  useQuery({ queryKey: ["crm", "lead", idu], queryFn: () => api<{ lead: Lead | null; notes: Note[]; tasks: Task[] }>(`/api/crm/lead-by-idu/${idu}`) });

/** Mutation générique qui invalide tout le cache CRM. */
export function useCrmMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ["crm"] }) });
}

export const crm = {
  addLead: (idu: string, extra: Record<string, unknown> = {}) => api<{ lead: Lead }>("/api/crm/leads", send("POST", { idu, ...extra })),
  patchLead: (id: string, body: Record<string, unknown>) => api("/api/crm/leads/" + id, send("PATCH", body)),
  deleteLead: (id: string) => api("/api/crm/leads/" + id, send("DELETE")),
  addNote: (id: string, body: string) => api(`/api/crm/leads/${id}/notes`, send("POST", { body })),
  addTask: (body: Record<string, unknown>) => api("/api/crm/tasks", send("POST", body)),
  patchTask: (id: string, body: Record<string, unknown>) => api("/api/crm/tasks/" + id, send("PATCH", body)),
  deleteTask: (id: string) => api("/api/crm/tasks/" + id, send("DELETE")),
  addContact: (body: Record<string, unknown>) => api<{ id: string }>("/api/crm/contacts", send("POST", body)),
  patchContact: (id: string, body: Record<string, unknown>) => api("/api/crm/contacts/" + id, send("PATCH", body)),
  deleteContact: (id: string) => api("/api/crm/contacts/" + id, send("DELETE")),
  addSector: (body: Record<string, unknown>) => api("/api/crm/sectors", send("POST", body)),
  patchSector: (id: string, body: Record<string, unknown>) => api("/api/crm/sectors/" + id, send("PATCH", body)),
  deleteSector: (id: string) => api("/api/crm/sectors/" + id, send("DELETE")),
};
