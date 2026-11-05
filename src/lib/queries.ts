import { queryOptions } from "@tanstack/react-query";
import { dashboardCounts, listAuditors, listSectors, listSettings, listUnits, listUsers } from "./registry.functions";
import type { Role } from "./permissions";

export type Unit = {
  id: string; name: string; code: string | null; address: string | null; city: string | null; state: string | null;
  active: boolean; created_at: string; updated_at: string; sector_count: number;
};
export type Sector = {
  id: string; unit_id: string; name: string; description: string | null; active: boolean; created_at: string; updated_at: string;
};
export type UserRow = {
  id: string; name: string; email: string; system_access: boolean; active: boolean; created_at: string; updated_at: string; role: Role | null;
};
export type Auditor = {
  id: string; user_id: string | null; name: string; cpf: string; admission_date: string | null; job_title: string | null;
  unit_id: string; sector_id: string; authorized: boolean; active: boolean; created_at: string; updated_at: string;
};

export const AUDITOR_COLUMNS = "id,user_id,name,cpf,admission_date,job_title,unit_id,sector_id,authorized,active,created_at,updated_at";

export const unitsQuery = queryOptions({
  queryKey: ["units"],
  queryFn: (): Promise<Unit[]> => listUnits(),
});

export const sectorsQuery = queryOptions({
  queryKey: ["sectors"],
  queryFn: (): Promise<Sector[]> => listSectors(),
});

export const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: (): Promise<UserRow[]> => listUsers(),
});

export const auditorsQuery = queryOptions({
  queryKey: ["auditors"],
  queryFn: (): Promise<Auditor[]> => listAuditors(),
});

export const dashboardQuery = queryOptions({
  queryKey: ["dashboard"],
  queryFn: () => dashboardCounts(),
});

export type Periodicity = "weekly" | "biweekly" | "monthly";
export type Settings = {
  audit_periodicity: Periodicity;
  scoring: { conforme: number; nc_parcial: number; nao_conforme: number; nao_se_aplica: "excluded" };
  medals: { gold_min: number; silver_min: number; bronze_min: number };
  deadline_alert_days: number;
};

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async (): Promise<Settings> => {
    const data = await listSettings();
    const map = Object.fromEntries(data.map((r) => [r.key, r.value])) as Record<string, unknown>;
    return {
      audit_periodicity: (map.audit_periodicity as Periodicity) ?? "monthly",
      scoring: (map.scoring as Settings["scoring"]) ?? { conforme: 100, nc_parcial: 50, nao_conforme: 0, nao_se_aplica: "excluded" },
      medals: (map.medals as Settings["medals"]) ?? { gold_min: 90, silver_min: 80, bronze_min: 70 },
      deadline_alert_days: Number(map.deadline_alert_days ?? 3) || 3,
    };
  },
});
