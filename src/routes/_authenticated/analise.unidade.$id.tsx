import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cleanFilters, validateFilters } from "@/lib/analytics";
import { useAnalytics } from "@/lib/use-analytics";
import { formatScore } from "@/lib/checklist";
import { EmptyState, LoadingBlock, PageHeader, Panel } from "@/components/app/kit";
import { Delta, FiltersBar, Kpi, ScoreMedal } from "@/components/app/analytics-ui";
import { CoverageBlock, HistoryChart, RecurrenceList, SectorRanking, SenseBars, TopNc } from "@/components/app/analytics-sections";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/analise/unidade/$id")({
  validateSearch: validateFilters,
  head: () => ({
    meta: [
      { title: "Análise da Unidade — Prestek 5S" },
      { name: "description", content: "Nota, cobertura, sensos, evolução e ranking interno dos setores da unidade." },
      { property: "og:title", content: "Análise da Unidade — Prestek 5S" },
      { property: "og:description", content: "Nota, cobertura, sensos, evolução e ranking interno dos setores da unidade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const f = useMemo(() => ({ ...search, unit: id }), [search, id]);
  const { loading, data } = useAnalytics(f);
  if (loading || !data) return <Panel><LoadingBlock /></Panel>;
  const unit = data.ctx.units.find((u) => u.id === id);
  if (!unit) return <Panel><EmptyState title="Unidade não encontrada." action={<Button asChild variant="outline"><Link to="/dashboard">Voltar</Link></Button>} /></Panel>;
  const { cur, prev, medals } = data;
  return (
    <>
      <Link to="/dashboard" search={cleanFilters(search) as never} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Dashboard</Link>
      <PageHeader title={unit.name} subtitle="Análise da Unidade" />
      <FiltersBar filters={search} show={["sector", "sense", "auditor"]} periodLabel={data.range.label} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="panel rise flex flex-col gap-1 p-4 sm:col-span-2">
          <span className="eyebrow">Nota da Unidade</span>
          {cur.overall === null ? <span className="font-display text-xl font-bold text-muted-foreground">Sem auditoria no período</span> : <ScoreMedal score={cur.overall} medals={medals} size="lg" />}
          {cur.overall !== null && <Delta value={prev.overall === null ? null : cur.overall - prev.overall} />}
        </div>
        <Kpi label="Cobertura" value={`${cur.coverage.done}/${cur.coverage.total}`} hint={cur.coverage.pct === null ? "—" : formatScore(cur.coverage.pct)} />
        <Kpi label="Setores pendentes" value={cur.pending.length} />
        <Kpi label="NC / NCP" value={`${cur.nc} / ${cur.ncp}`} />
        <Kpi label="Planos pendentes" value={data.openPlans.length} hint={`${data.overduePlans.length} vencida(s)`} tone={data.overduePlans.length ? "danger" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectorRanking a={cur} prev={data.prevSector} medals={medals} f={search} title="Ranking interno dos Setores" />
        <div className="grid content-start gap-4"><HistoryChart data={data.history} /><SenseBars a={cur} f={search} medals={medals} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <CoverageBlock a={cur} f={search} units={[unit]} />
        <TopNc a={cur} />
        <RecurrenceList items={data.recurrences} limit={6} />
      </div>
    </>
  );
}
