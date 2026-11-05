import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, FileDown } from "lucide-react";
import { validateFilters, cleanFilters } from "@/lib/analytics";
import { useAnalytics } from "@/lib/use-analytics";
import { formatScore } from "@/lib/checklist";
import { LoadingBlock, PageHeader, Panel } from "@/components/app/kit";
import { Delta, FiltersBar, Kpi, ScoreMedal } from "@/components/app/analytics-ui";
import { CoverageBlock, HistoryChart, RecurrenceList, SectorRanking, SenseBars, TopNc, UnitRanking } from "@/components/app/analytics-sections";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: validateFilters,
  head: () => ({
    meta: [
      { title: "Dashboard Executivo — Prestek 5S" },
      { name: "description", content: "Nota Geral 5S, rankings, cobertura, sensos, NC/NCP e planos de ação." },
      { property: "og:title", content: "Dashboard Executivo — Prestek 5S" },
      { property: "og:description", content: "Nota Geral 5S, rankings, cobertura, sensos, NC/NCP e planos de ação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const f = Route.useSearch();
  const navigate = useNavigate();
  const { loading, data } = useAnalytics(f);

  const ncGroups = useMemo(() => {
    if (!data) return { units: [], sectors: [] };
    const byAudit = new Map(data.cur.scoped.map((a) => [a.id, a]));
    const u = new Map<string, { name: string; nc: number; ncp: number }>();
    const s = new Map<string, { id: string; name: string; unit: string; nc: number; ncp: number }>();
    data.cur.answers.forEach((x) => {
      const a = byAudit.get(x.audit_id)!;
      const isNc = x.answer === "NON_COMPLIANT";
      const ue = u.get(a.unit_id) ?? { name: a.unit_name_snapshot, nc: 0, ncp: 0 };
      const se = s.get(a.sector_id) ?? { id: a.sector_id, name: a.sector_name_snapshot, unit: a.unit_name_snapshot, nc: 0, ncp: 0 };
      if (isNc) { ue.nc++; se.nc++; } else { ue.ncp++; se.ncp++; }
      u.set(a.unit_id, ue); s.set(a.sector_id, se);
    });
    const sort = <T extends { nc: number; ncp: number }>(m: Map<string, T>) => [...m.values()].sort((a, b) => b.nc + b.ncp - a.nc - a.ncp);
    return { units: sort(u), sectors: sort(s) };
  }, [data]);

  if (loading || !data) return <><PageHeader title="Dashboard" subtitle="Programa 5S" /><Panel><LoadingBlock /></Panel></>;
  const { cur, prev, medals } = data;
  const delta = cur.overall !== null && prev.overall !== null ? cur.overall - prev.overall : null;
  const goal = Math.max(medals.bronze_min, 70);

  const attention = [
    data.overduePlans.length && { sev: 0, tone: "red", text: `${data.overduePlans.length} ação(ões) vencida(s)`, to: "/plano-de-acao" as const, search: { prazo: "OVERDUE" } },
    data.recurrences.length && { sev: 1, tone: "red", text: `${data.recurrences.length} NC recorrente(s) detectada(s)` },
    cur.sectorScores.filter((s) => s.score < 70).length && { sev: 2, tone: "red", text: `${cur.sectorScores.filter((s) => s.score < 70).length} setor(es) abaixo de 70%` },
    cur.pending.length && { sev: 3, tone: "orange", text: `${cur.pending.length} setor(es) ainda não auditado(s)` },
    cur.senses.filter((s) => s.score !== null && s.score < goal).length && { sev: 4, tone: "orange", text: `Sensos abaixo da meta (${goal}%): ${cur.senses.filter((s) => s.score !== null && s.score < goal).map((s) => s.label).join(", ")}` },
  ].filter(Boolean) as { sev: number; tone: string; text: string; to?: "/plano-de-acao"; search?: Record<string, string> }[];

  return (
    <>
      <PageHeader title="Dashboard Executivo" subtitle="Programa 5S"
        actions={<Button variant="outline" asChild><Link to="/relatorios/executivo" search={cleanFilters(f) as never}><FileDown className="size-4" /> PDF Executivo</Link></Button>} />
      <FiltersBar filters={f} periodLabel={`${data.range.label} · comparado com ${data.range.prev.label}`} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div className="panel rise flex flex-col gap-1 p-4 sm:col-span-2 lg:col-span-2 xl:col-span-2">
          <span className="eyebrow">Nota Geral 5S{f.sense ? " (senso filtrado)" : ""}</span>
          {cur.overall === null ? <span className="font-display text-2xl font-bold text-muted-foreground">Sem auditoria no período</span>
            : <ScoreMedal score={cur.overall} medals={medals} size="lg" />}
          {cur.overall !== null && <Delta value={delta} />}
        </div>
        <Kpi label="Auditorias realizadas" value={cur.auditsCount} hint={data.inProgress ? `${data.inProgress} em andamento` : "Concluídas no período"} onClick={() => navigate({ to: "/auditorias" })} />
        <Kpi label="Cobertura" value={`${cur.coverage.done} / ${cur.coverage.total}`} hint={cur.coverage.pct === null ? "Sem setores" : `${formatScore(cur.coverage.pct)} auditados`} />
        <Kpi label="Não Conformidades" value={cur.nc} hint={<Delta value={cur.nc - prev.nc} className="[&]:text-muted-foreground" />} />
        <Kpi label="NC Parciais" value={cur.ncp} hint={`Anterior: ${prev.ncp}`} />
        <Kpi label="Planos pendentes" value={data.openPlans.length} hint={<span className={cn(data.overduePlans.length && "font-medium text-destructive")}>{data.overduePlans.length} vencida(s)</span>}
          tone={data.overduePlans.length ? "danger" : undefined} onClick={() => navigate({ to: "/plano-de-acao" })} />
      </div>

      <Panel title="Pontos de Atenção" aside={<AlertTriangle className="size-4 text-muted-foreground" />}>
        {!attention.length ? <p className="text-sm text-muted-foreground">Nenhum ponto crítico no período.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {attention.sort((a, b) => a.sev - b.sev).map((x) => (
              <li key={x.text} className="flex items-center gap-2 text-sm">
                <span className={cn("size-2.5 shrink-0 rounded-full", x.tone === "red" ? "bg-destructive" : "bg-warning")} />
                {x.to ? <Link to={x.to} search={x.search as never} className="hover:text-primary hover:underline">{x.text}</Link> : x.text}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <UnitRanking a={cur} prev={data.prevUnit} medals={medals} f={f} />
        <CoverageBlock a={cur} f={f} units={data.ctx.units} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectorRanking a={cur} prev={data.prevSector} medals={medals} f={f} />
        <div className="grid content-start gap-4">
          <HistoryChart data={data.history} />
          <SenseBars a={cur} f={f} medals={medals} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <TopNc a={cur} />
        <Panel title="NC/NCP por Unidade">
          {!ncGroups.units.length ? <p className="text-sm text-muted-foreground">Nenhuma Não Conformidade registrada.</p> : (
            <ul className="grid gap-1.5 text-sm">{ncGroups.units.map((u) => <li key={u.name} className="flex justify-between"><span>{u.name}</span><span className="font-mono text-xs">NC {u.nc} · NCP {u.ncp}</span></li>)}</ul>
          )}
          <h3 className="mt-5 text-sm font-semibold">Por Setor</h3>
          <ul className="mt-2 grid gap-1.5 text-sm">{ncGroups.sectors.slice(0, 10).map((s) => (
            <li key={s.id}><Link to="/analise/setor/$id" params={{ id: s.id }} search={cleanFilters({ ...f, sector: "" }) as never} className="flex justify-between gap-2 hover:text-primary">
              <span className="truncate">{s.name} <span className="text-xs text-muted-foreground">· {s.unit}</span></span><span className="shrink-0 font-mono text-xs">NC {s.nc} · NCP {s.ncp}</span></Link></li>
          ))}</ul>
        </Panel>
        <RecurrenceList items={data.recurrences} limit={6} />
      </div>
    </>
  );
}
