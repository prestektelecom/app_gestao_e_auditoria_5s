import { queryOptions } from "@tanstack/react-query";
import type { SearchSchemaInput } from "@tanstack/react-router";
import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { listActionPlans, listCompletedAudits, listNcAnswers } from "./analytics.functions";
import { SENSES } from "./checklist";
import type { Sector, Unit } from "./queries";

/* ---------------- Filters (URL search params) ---------------- */
export type Filters = { m: string; from: string; to: string; unit: string; sector: string; sense: string; auditor: string };
export const EMPTY_FILTERS: Filters = { m: "", from: "", to: "", unit: "", sector: "", sense: "", auditor: "" };
export function validateFilters(input: Partial<Filters> & SearchSchemaInput): Filters {
  const s = input as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  return { m: str(s.m), from: str(s.from), to: str(s.to), unit: str(s.unit), sector: str(s.sector), sense: str(s.sense), auditor: str(s.auditor) };
}
/** Only keep non-empty params in the URL. */
export function cleanFilters(f: Partial<Filters>): Partial<Filters> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Partial<Filters>;
}

export type Range = { start: string; end: string; label: string; prev: { start: string; end: string; label: string } };
const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const monthLabel = (d: Date) => { const s = format(d, "MMMM/yyyy", { locale: ptBR }); return s[0]!.toUpperCase() + s.slice(1); };
const dmy = (s: string) => format(parseISO(s), "dd/MM/yyyy");

export function resolveRange(f: Filters): Range {
  if (f.from && f.to && f.from <= f.to) {
    const len = differenceInCalendarDays(parseISO(f.to), parseISO(f.from)) + 1;
    const pe = addDays(parseISO(f.from), -1);
    const ps = addDays(pe, -(len - 1));
    return { start: f.from, end: f.to, label: `${dmy(f.from)} a ${dmy(f.to)}`, prev: { start: ymd(ps), end: ymd(pe), label: `${dmy(ymd(ps))} a ${dmy(ymd(pe))}` } };
  }
  const base = /^\d{4}-\d{2}$/.test(f.m) ? parseISO(f.m + "-01") : new Date();
  const prev = subMonths(base, 1);
  return {
    start: ymd(startOfMonth(base)), end: ymd(endOfMonth(base)), label: monthLabel(base),
    prev: { start: ymd(startOfMonth(prev)), end: ymd(endOfMonth(prev)), label: monthLabel(prev) },
  };
}
export const currentMonth = () => format(new Date(), "yyyy-MM");
export function monthOptions(n = 24): [string, string][] {
  return Array.from({ length: n }, (_, i) => { const d = subMonths(new Date(), i); return [format(d, "yyyy-MM"), monthLabel(d)] as [string, string]; });
}
export const localDay = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

/* ---------------- Medals ---------------- */
export type Medals = { gold_min: number; silver_min: number; bronze_min: number };
export type MedalCode = "OURO" | "PRATA" | "BRONZE" | "SEM_INDICE";
export function medalOf(score: number | null | undefined, md: Medals): MedalCode | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  if (score >= md.gold_min) return "OURO";
  if (score >= md.silver_min) return "PRATA";
  if (score >= Math.max(md.bronze_min, 70)) return "BRONZE";
  return "SEM_INDICE";
}

/* ---------------- Data ---------------- */
export type AuditLite = {
  id: string; audit_number: string; unit_id: string; sector_id: string; unit_name_snapshot: string; sector_name_snapshot: string;
  auditor_id: string; auditor_name_snapshot: string; started_at: string; finished_at: string | null; overall_score: number | null;
  classification: string | null; sense_scores: Record<string, number | null>; nc_count: number; ncp_count: number; status: string;
};
export const completedAuditsQuery = queryOptions({
  queryKey: ["analytics", "audits"],
  queryFn: async () => {
    const { audits, inProgress } = await listCompletedAudits();
    return { audits: audits.map((a) => ({ ...a, overall_score: a.overall_score === null ? null : Number(a.overall_score) })) as AuditLite[], inProgress };
  },
});

export type NcAnswer = { id: string; audit_id: string; question_id: string; question_snapshot: string; sense_snapshot: string; order_snapshot: number; answer: string; observation: string | null };
export const ncAnswersQuery = queryOptions({
  queryKey: ["analytics", "nc-answers"],
  queryFn: (): Promise<NcAnswer[]> => listNcAnswers(),
});

export type ActionPlan = {
  id: string; audit_id: string; audit_answer_id: string; unit_id: string; sector_id: string; unit_name: string; sector_name: string;
  sense: string; question: string; nc_type: string; occurrence: string | null; what: string | null; why: string | null; where_text: string | null;
  who: string | null; when_date: string | null; how: string | null; how_much: number | null; status: string; created_at: string; updated_at: string;
  completed_at: string | null; origin_changed: boolean; origin_note: string | null; audits?: { audit_number: string; finished_at: string | null; auditor_name_snapshot: string } | null;
};
export const plansQuery = queryOptions({
  queryKey: ["action-plans"],
  queryFn: async () => {
    const data = await listActionPlans();
    return data.map((p) => ({ ...p, how_much: p.how_much === null ? null : Number(p.how_much) })) as ActionPlan[];
  },
});

/* ---------------- Action plan status / deadline ---------------- */
export const PLAN_STATUS: Record<string, string> = { PENDENTE: "Pendente", EM_ANDAMENTO: "Em andamento", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };
export const isOpen = (p: Pick<ActionPlan, "status">) => p.status === "PENDENTE" || p.status === "EM_ANDAMENTO";
export type Deadline = { code: "DONE" | "CANCELED" | "NONE" | "OVERDUE" | "TODAY" | "SOON" | "OK"; label: string; days: number | null };
export function deadlineOf(p: Pick<ActionPlan, "status" | "when_date">, alertDays: number, today = new Date()): Deadline {
  if (p.status === "CONCLUIDO") return { code: "DONE", label: "Concluído", days: null };
  if (p.status === "CANCELADO") return { code: "CANCELED", label: "Cancelado", days: null };
  if (!p.when_date) return { code: "NONE", label: "Prazo não definido", days: null };
  const d = differenceInCalendarDays(parseISO(p.when_date), today);
  if (d < 0) return { code: "OVERDUE", label: `Vencido há ${-d} dia${d === -1 ? "" : "s"}`, days: d };
  if (d === 0) return { code: "TODAY", label: "Vence hoje", days: 0 };
  if (d <= alertDays) return { code: "SOON", label: `Vence em ${d} dia${d === 1 ? "" : "s"}`, days: d };
  return { code: "OK", label: "No prazo", days: d };
}
export const isOverdue = (p: Pick<ActionPlan, "status" | "when_date" | "origin_changed">) =>
  isOpen(p) && !p.origin_changed && !!p.when_date && differenceInCalendarDays(parseISO(p.when_date), new Date()) < 0;

/* ---------------- Core analysis ---------------- */
export type SectorScore = {
  sector_id: string; unit_id: string; sector_name: string; unit_name: string; score: number; audit: AuditLite; nc: number; ncp: number; finished_at: string;
};
export type Ctx = { audits: AuditLite[]; sectors: Sector[]; units: Unit[]; ncAnswers: NcAnswer[] };

export function scopeAudits(audits: AuditLite[], f: Filters, start: string, end: string) {
  return audits.filter((a) => {
    if (!a.finished_at) return false;
    const d = localDay(a.finished_at);
    return d >= start && d <= end && (!f.unit || a.unit_id === f.unit) && (!f.sector || a.sector_id === f.sector) && (!f.auditor || a.auditor_id === f.auditor);
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

export function analyze(ctx: Ctx, f: Filters, start: string, end: string) {
  const scoped = scopeAudits(ctx.audits, f, start, end);
  const scopedIds = new Set(scoped.map((a) => a.id));
  const answers = ctx.ncAnswers.filter((x) => scopedIds.has(x.audit_id) && (!f.sense || x.sense_snapshot === f.sense));
  const ncBy = new Map<string, { nc: number; ncp: number }>();
  answers.forEach((x) => {
    const c = ncBy.get(x.audit_id) ?? { nc: 0, ncp: 0 };
    if (x.answer === "NON_COMPLIANT") c.nc++; else c.ncp++;
    ncBy.set(x.audit_id, c);
  });

  // latest completed audit per sector in the period
  const latest = new Map<string, AuditLite>();
  [...scoped].sort((a, b) => (b.finished_at! > a.finished_at! ? 1 : -1)).forEach((a) => { if (!latest.has(a.sector_id)) latest.set(a.sector_id, a); });
  const sectorName = new Map(ctx.sectors.map((s) => [s.id, s.name]));
  const unitName = new Map(ctx.units.map((u) => [u.id, u.name]));

  const sectorScores: SectorScore[] = [];
  latest.forEach((a) => {
    const sc = f.sense ? a.sense_scores?.[f.sense] : a.overall_score;
    if (sc === null || sc === undefined) return;
    const c = ncBy.get(a.id) ?? { nc: 0, ncp: 0 };
    sectorScores.push({
      sector_id: a.sector_id, unit_id: a.unit_id, sector_name: a.sector_name_snapshot || sectorName.get(a.sector_id) || "—",
      unit_name: a.unit_name_snapshot || unitName.get(a.unit_id) || "—", score: Number(sc), audit: a, nc: c.nc, ncp: c.ncp, finished_at: a.finished_at!,
    });
  });
  sectorScores.sort((a, b) => b.score - a.score || a.nc - b.nc || a.ncp - b.ncp || (b.finished_at > a.finished_at ? 1 : -1) || a.sector_name.localeCompare(b.sector_name));

  // coverage — active sectors of active units in scope
  const activeUnits = new Set(ctx.units.filter((u) => u.active).map((u) => u.id));
  const scopeSectors = ctx.sectors.filter((s) => s.active && activeUnits.has(s.unit_id) && (!f.unit || s.unit_id === f.unit) && (!f.sector || s.id === f.sector));
  const auditedSet = new Set(latest.keys());
  const pending = scopeSectors.filter((s) => !auditedSet.has(s.id));
  const audited = scopeSectors.length - pending.length;

  // units
  const unitMap = new Map<string, { unit_id: string; name: string; scores: number[]; nc: number; ncp: number }>();
  sectorScores.forEach((s) => {
    const u = unitMap.get(s.unit_id) ?? { unit_id: s.unit_id, name: unitName.get(s.unit_id) ?? s.unit_name, scores: [], nc: 0, ncp: 0 };
    u.scores.push(s.score); u.nc += s.nc; u.ncp += s.ncp; unitMap.set(s.unit_id, u);
  });
  const unitCoverage = (uid: string) => {
    const all = scopeSectors.filter((s) => s.unit_id === uid);
    const done = all.filter((s) => auditedSet.has(s.id)).length;
    return { total: all.length, done };
  };
  const unitScores = [...unitMap.values()].map((u) => ({ unit_id: u.unit_id, name: u.name, score: mean(u.scores)!, sectors: u.scores.length, nc: u.nc, ncp: u.ncp, coverage: unitCoverage(u.unit_id) }))
    .sort((a, b) => b.score - a.score || a.nc - b.nc || a.name.localeCompare(b.name));
  const unitsWithout = ctx.units.filter((u) => u.active && (!f.unit || u.id === f.unit) && !unitMap.has(u.id) && scopeSectors.some((s) => s.unit_id === u.id));

  // senses (from latest audits)
  const latestList = [...latest.values()];
  const senses = SENSES.filter((s) => !f.sense || s.code === f.sense).map((s) => ({
    code: s.code, label: s.label,
    score: mean(latestList.map((a) => a.sense_scores?.[s.code]).filter((v): v is number => v !== null && v !== undefined).map(Number)),
    nc: answers.filter((x) => x.sense_snapshot === s.code && x.answer === "NON_COMPLIANT").length,
    ncp: answers.filter((x) => x.sense_snapshot === s.code && x.answer === "PARTIALLY_NON_COMPLIANT").length,
  }));

  // top questions
  const qMap = new Map<string, { key: string; text: string; sense: string; nc: number; ncp: number }>();
  answers.forEach((x) => {
    const k = x.question_snapshot;
    const q = qMap.get(k) ?? { key: k, text: x.question_snapshot, sense: x.sense_snapshot, nc: 0, ncp: 0 };
    if (x.answer === "NON_COMPLIANT") q.nc++; else q.ncp++;
    qMap.set(k, q);
  });
  const topQuestions = [...qMap.values()].sort((a, b) => b.nc + b.ncp - (a.nc + a.ncp) || b.nc - a.nc);

  return {
    scoped, answers, sectorScores, unitScores, unitsWithout, senses, topQuestions, latest,
    overall: mean(sectorScores.map((s) => s.score)),
    auditsCount: scoped.length,
    nc: answers.filter((x) => x.answer === "NON_COMPLIANT").length,
    ncp: answers.filter((x) => x.answer === "PARTIALLY_NON_COMPLIANT").length,
    coverage: { total: scopeSectors.length, done: audited, pct: scopeSectors.length ? (audited / scopeSectors.length) * 100 : null },
    pending,
  };
}
export type Analysis = ReturnType<typeof analyze>;

/** Monthly evolution of the consolidated score (last N months up to the selected end). */
export function history(ctx: Ctx, f: Filters, endDay: string, months = 6) {
  const base = parseISO(endDay);
  return Array.from({ length: months }, (_, i) => {
    const d = subMonths(base, months - 1 - i);
    const r = analyze(ctx, f, ymd(startOfMonth(d)), ymd(endOfMonth(d)));
    const lbl = format(d, "MMM/yy", { locale: ptBR });
    return { label: lbl[0]!.toUpperCase() + lbl.slice(1), score: r.overall === null ? null : Math.round(r.overall * 10) / 10 };
  });
}

/** Questions answered NC/NCP in consecutive completed audits of the same sector. */
export function recurrences(ctx: Ctx, f: Filters, start: string, end: string) {
  const bySector = new Map<string, AuditLite[]>();
  ctx.audits.filter((a) => a.finished_at && (!f.unit || a.unit_id === f.unit) && (!f.sector || a.sector_id === f.sector))
    .forEach((a) => { const l = bySector.get(a.sector_id) ?? []; l.push(a); bySector.set(a.sector_id, l); });
  const bad = new Map<string, NcAnswer>();
  ctx.ncAnswers.forEach((x) => { if (!f.sense || x.sense_snapshot === f.sense) bad.set(`${x.audit_id}|${x.question_snapshot}`, x); });
  const out: { sector_id: string; sector_name: string; unit_name: string; question: string; sense: string; order: number; dates: string[]; count: number }[] = [];
  bySector.forEach((list) => {
    list.sort((a, b) => (a.finished_at! > b.finished_at! ? 1 : -1));
    const last = [...list].reverse().find((a) => { const d = localDay(a.finished_at!); return d >= start && d <= end; });
    if (!last) return;
    const idx = list.indexOf(last);
    ctx.ncAnswers.filter((x) => x.audit_id === last.id && (!f.sense || x.sense_snapshot === f.sense)).forEach((x) => {
      const dates = [last.finished_at!];
      for (let i = idx - 1; i >= 0; i--) {
        if (bad.has(`${list[i]!.id}|${x.question_snapshot}`)) dates.unshift(list[i]!.finished_at!); else break;
      }
      if (dates.length >= 2) out.push({ sector_id: last.sector_id, sector_name: last.sector_name_snapshot, unit_name: last.unit_name_snapshot, question: x.question_snapshot, sense: x.sense_snapshot, order: x.order_snapshot, dates, count: dates.length });
    });
  });
  return out.sort((a, b) => b.count - a.count);
}

/* ---------------- CSV ---------------- */
export function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const pp = (v: number | null) => (v === null ? null : (v > 0 ? "↑ " : v < 0 ? "↓ " : "= ") + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(v)) + " p.p.");
