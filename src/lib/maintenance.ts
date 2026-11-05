import { queryOptions } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { getMaintenanceImageUrls, listMaintNotes } from "./maintenance.functions";

export const MAINT_BUCKET = "maintenance-images";

export const NOTE_STATUS = [
  { value: "ABERTA", label: "Aberta" },
  { value: "EM_ANDAMENTO", label: "Em andamento" },
  { value: "CONCLUIDA", label: "Concluída" },
  { value: "CANCELADA", label: "Cancelada" },
] as const;
export const NOTE_PRIORITY = [
  { value: "BAIXA", label: "Baixa" },
  { value: "MEDIA", label: "Média" },
  { value: "ALTA", label: "Alta" },
] as const;

export const statusLabel = (s: string) => NOTE_STATUS.find((x) => x.value === s)?.label ?? s;
export const priorityLabel = (s: string) => NOTE_PRIORITY.find((x) => x.value === s)?.label ?? s;

export type MaintNote = {
  id: string; note_number: string; note_date: string; note_time: string; requester_name: string;
  unit_id: string; sector_id: string; unit_name: string; sector_name: string; description: string;
  source: string; status: string; priority: string; assignee_name: string | null; due_date: string | null;
  resolution: string | null; completed_at: string | null; created_at: string; updated_at: string;
  maintenance_note_images: { id: string; storage_path: string }[];
};

export const maintNotesQuery = queryOptions({
  queryKey: ["maint-notes"],
  queryFn: (): Promise<MaintNote[]> => listMaintNotes(),
});

export function isLate(n: Pick<MaintNote, "due_date" | "status">, today = new Date().toISOString().slice(0, 10)) {
  return !!n.due_date && n.due_date < today && (n.status === "ABERTA" || n.status === "EM_ANDAMENTO");
}

export function useSignedUrls(paths: string[]) {
  return useQuery({
    queryKey: ["maint-urls", paths],
    enabled: paths.length > 0,
    queryFn: (): Promise<Record<string, string>> => getMaintenanceImageUrls({ data: { paths } }),
    staleTime: 30 * 60 * 1000,
  });
}

export const statusTone = (s: string) =>
  s === "CONCLUIDA" ? "bg-success/10 text-success"
  : s === "EM_ANDAMENTO" ? "bg-primary/10 text-primary"
  : s === "CANCELADA" ? "bg-muted text-muted-foreground"
  : "bg-warning/15 text-warning";
