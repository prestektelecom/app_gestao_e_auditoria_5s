import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLASSIFICATION, SENSES, formatScore } from "@/lib/checklist";
import { cleanFilters, currentMonth, medalOf, monthOptions, type Filters, type Medals } from "@/lib/analytics";
import { completedAuditsQuery, deadlineOf, type ActionPlan } from "@/lib/analytics";
import { sectorsQuery, unitsQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Panel } from "./kit";

const MEDAL_STYLE: Record<string, string> = {
  OURO: "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-foreground",
  PRATA: "bg-muted text-foreground",
  BRONZE: "bg-[color-mix(in_oklab,var(--warning)_9%,transparent)] text-foreground",
  SEM_INDICE: "bg-transparent text-muted-foreground border border-border",
};

/** Always "87,4% — 🥈 Prata": the medal never replaces the score. */
export function ScoreMedal({ score, cls, medals, className, size = "sm" }: {
  score: number | null | undefined; cls?: string | null; medals?: Medals; className?: string; size?: "sm" | "lg";
}) {
  if (score === null || score === undefined) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const code = cls ?? (medals ? medalOf(score, medals) : null);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <span className={cn("font-display font-bold tabular-nums", size === "lg" ? "text-4xl" : "text-sm")}>{formatScore(score)}</span>
      {code && <MedalChip code={code} />}
    </span>
  );
}
export function MedalChip({ code }: { code: string }) {
  const c = CLASSIFICATION[code];
  if (!c) return null;
  return <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", MEDAL_STYLE[code])}>{c.emoji} {c.label}</span>;
}

export function Delta({ value, className }: { value: number | null; className?: string }) {
  if (value === null || Number.isNaN(value)) return <span className={cn("text-xs text-muted-foreground", className)}>Sem base no período anterior</span>;
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : Minus;
  const txt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Math.abs(value));
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", value > 0.05 ? "text-success" : value < -0.05 ? "text-destructive" : "text-muted-foreground", className)}>
      <Icon className="size-3.5" /> {txt} p.p.
    </span>
  );
}

export function Kpi({ label, value, hint, tone, onClick }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warn"; onClick?: () => void }) {
  const cls = cn("panel rise flex flex-col items-start gap-1 p-4 text-left transition", onClick && "hover:-translate-y-0.5", tone === "danger" && "ring-1 ring-destructive/30");
  const body = (
    <>
      <span className="eyebrow">{label}</span>
      <span className={cn("font-display text-2xl font-bold tabular-nums", tone === "danger" && "text-destructive")}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

export function Bar({ value, className }: { value: number | null; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  );
}

export function DeadlineBadge({ plan, alertDays }: { plan: Pick<ActionPlan, "status" | "when_date">; alertDays: number }) {
  const d = deadlineOf(plan, alertDays);
  const tone = d.code === "OVERDUE" ? "bg-destructive/10 text-destructive" : d.code === "TODAY" || d.code === "SOON" ? "bg-warning/15 text-foreground"
    : d.code === "DONE" ? "bg-success/10 text-success" : d.code === "OK" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", tone)}>{d.code === "OVERDUE" ? "🔴 " : ""}{d.label}</span>;
}

function Sel({ value, onChange, all, items, label }: { value: string; onChange: (v: string) => void; all: string; items: [string, string][]; label: string }) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger aria-label={label} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">{all}</SelectItem>{items.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Global analysis filters — kept in the URL so they survive navigation to unit/sector/sense details. */
export function FiltersBar({ filters, show = ["unit", "sector", "sense", "auditor"], periodLabel }: {
  filters: Filters; show?: ("unit" | "sector" | "sense" | "auditor")[]; periodLabel?: string;
}) {
  const navigate = useNavigate();
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const audits = useQuery(completedAuditsQuery);
  const set = (patch: Partial<Filters>) =>
    navigate({ to: ".", search: cleanFilters({ ...filters, ...patch }) as never, replace: true });
  const mode = filters.from || filters.to ? "range" : "month";
  const auditors = [...new Map((audits.data?.audits ?? []).map((a) => [a.auditor_id, a.auditor_name_snapshot])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const any = Object.values(filters).some(Boolean);

  return (
    <Panel className="print:hidden">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Select value={mode} onValueChange={(v) => set(v === "month" ? { from: "", to: "" } : { m: "", from: filters.from || "", to: filters.to || "" })}>
          <SelectTrigger aria-label="Modo de período"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="month">Mês fechado</SelectItem><SelectItem value="range">Intervalo personalizado</SelectItem></SelectContent>
        </Select>
        {mode === "month" ? (
          <Select value={filters.m || currentMonth()} onValueChange={(v) => set({ m: v === currentMonth() ? "" : v })}>
            <SelectTrigger aria-label="Mês"><SelectValue /></SelectTrigger>
            <SelectContent>{monthOptions().map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <div className="flex gap-2 sm:col-span-2">
            <Input type="date" aria-label="Data inicial" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
            <Input type="date" aria-label="Data final" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
        )}
        {show.includes("unit") && <Sel label="Unidade" value={filters.unit} onChange={(v) => set({ unit: v, sector: "" })} all="Todas as unidades" items={(units.data ?? []).map((u) => [u.id, u.name])} />}
        {show.includes("sector") && <Sel label="Setor" value={filters.sector} onChange={(v) => set({ sector: v })} all="Todos os setores"
          items={(sectors.data ?? []).filter((s) => !filters.unit || s.unit_id === filters.unit).map((s) => [s.id, s.name])} />}
        {show.includes("sense") && <Sel label="Senso" value={filters.sense} onChange={(v) => set({ sense: v })} all="Todos os sensos" items={SENSES.map((s) => [s.code, s.label])} />}
        {show.includes("auditor") && <Sel label="Auditor" value={filters.auditor} onChange={(v) => set({ auditor: v })} all="Todos os auditores" items={auditors} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {periodLabel && <span>Período: <b className="text-foreground">{periodLabel}</b></span>}
        {mode === "range" && (!filters.from || !filters.to) && <span>Informe data inicial e final — exibindo o mês atual.</span>}
        {any && <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => navigate({ to: ".", search: {} as never, replace: true })}><X className="size-3.5" /> Limpar filtros</Button>}
      </div>
    </Panel>
  );
}
