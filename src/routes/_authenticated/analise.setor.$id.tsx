import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cleanFilters, localDay, PLAN_STATUS, validateFilters } from "@/lib/analytics";
import { useAnalytics } from "@/lib/use-analytics";
import { formatScore, senseLabel, SENSES } from "@/lib/checklist";
import { formatDate, formatDateTime } from "@/lib/format";
import { EmptyState, LoadingBlock, PageHeader, Panel } from "@/components/app/kit";
import { DeadlineBadge, FiltersBar, Kpi, ScoreMedal } from "@/components/app/analytics-ui";
import { HistoryChart, RecurrenceList } from "@/components/app/analytics-sections";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/analise/setor/$id")({
  validateSearch: validateFilters,
  head: () => ({
    meta: [
      { title: "Análise do Setor — Prestek 5S" },
      { name: "description", content: "Última auditoria, nota por senso, histórico e planos de ação do setor." },
      { property: "og:title", content: "Análise do Setor — Prestek 5S" },
      { property: "og:description", content: "Última auditoria, nota por senso, histórico e planos de ação do setor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const f = useMemo(() => ({ ...search, sector: id, unit: "" }), [search, id]);
  const { loading, data } = useAnalytics(f, { historyMonths: 12 });
  if (loading || !data) return <Panel><LoadingBlock /></Panel>;
  const sector = data.ctx.sectors.find((s) => s.id === id);
  if (!sector) return <Panel><EmptyState title="Setor não encontrado." action={<Button asChild variant="outline"><Link to="/dashboard">Voltar</Link></Button>} /></Panel>;
  const unit = data.ctx.units.find((u) => u.id === sector.unit_id);
  const { cur, medals } = data;
  const last = cur.latest.get(id);
  const all = data.ctx.audits.filter((a) => a.sector_id === id);
  const inPeriod = all.filter((a) => { const d = localDay(a.finished_at!); return d >= data.range.start && d <= data.range.end; });
  return (
    <>
      <Link to="/dashboard" search={cleanFilters(search) as never} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Dashboard</Link>
      <PageHeader title={sector.name} subtitle={`Setor · ${unit?.name ?? ""}`} />
      <FiltersBar filters={search} show={["sense", "auditor"]} periodLabel={data.range.label} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="panel rise flex flex-col gap-1 p-4 sm:col-span-2">
          <span className="eyebrow">Nota atual (última auditoria do período)</span>
          {!last ? <span className="font-display text-xl font-bold text-muted-foreground">Pendente</span> : <ScoreMedal score={cur.overall} medals={medals} size="lg" />}
          {last && <Link to="/auditorias/$id" params={{ id: last.id }} className="text-xs text-primary hover:underline">{last.audit_number} · {formatDateTime(last.finished_at)}</Link>}
        </div>
        <Kpi label="Auditorias no período" value={inPeriod.length} hint={`${all.length} no histórico`} />
        <Kpi label="NC / NCP" value={`${cur.nc} / ${cur.ncp}`} />
        <Kpi label="Planos abertos" value={data.openPlans.length} hint={`${data.overduePlans.length} vencida(s)`} tone={data.overduePlans.length ? "danger" : undefined} />
      </div>
      {last && (
        <Panel title="Nota por Senso">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {SENSES.map((s) => <div key={s.code} className="empty-well p-3"><p className="eyebrow truncate">{s.label}</p><p className="mt-1 font-display text-lg font-bold">{formatScore(last.sense_scores?.[s.code])}</p></div>)}
          </div>
        </Panel>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <HistoryChart data={data.history} title="Evolução do Setor" />
        <RecurrenceList items={data.recurrences} />
      </div>
      <Panel title="Histórico de auditorias">
        {!all.length ? <EmptyState compact title="Nenhuma auditoria concluída para este setor." /> : (
          <Table><TableHeader><TableRow><TableHead>Auditoria</TableHead><TableHead>Data</TableHead><TableHead>Auditor</TableHead><TableHead>Nota</TableHead><TableHead>NC/NCP</TableHead></TableRow></TableHeader>
            <TableBody>{all.map((a) => (
              <TableRow key={a.id}>
                <TableCell><Link to="/auditorias/$id" params={{ id: a.id }} className="font-mono text-primary hover:underline">{a.audit_number}</Link></TableCell>
                <TableCell>{formatDate(a.finished_at)}</TableCell><TableCell>{a.auditor_name_snapshot}</TableCell>
                <TableCell><ScoreMedal score={a.overall_score} cls={a.classification} /></TableCell><TableCell className="font-mono text-xs">{a.nc_count} / {a.ncp_count}</TableCell>
              </TableRow>))}</TableBody></Table>
        )}
      </Panel>
      <Panel title="Planos de Ação do Setor">
        {!data.plans.length ? <EmptyState compact title="Nenhum plano de ação para este setor." /> : (
          <ul className="grid gap-2">{data.plans.map((p) => (
            <li key={p.id}><Link to="/plano-de-acao/$id" params={{ id: p.id }} className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm transition hover:bg-foreground/5 sm:flex-row sm:items-center sm:gap-3">
              <span className="font-mono text-xs">{p.nc_type}</span><span className="flex-1">{p.question} <span className="text-xs text-muted-foreground">· {senseLabel(p.sense)}</span></span>
              <span className="text-xs">{PLAN_STATUS[p.status]}</span><DeadlineBadge plan={p} alertDays={data.settings.deadline_alert_days} />
            </Link></li>))}</ul>
        )}
      </Panel>
    </>
  );
}
