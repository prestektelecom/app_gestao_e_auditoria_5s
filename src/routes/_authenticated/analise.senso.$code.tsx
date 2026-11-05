import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cleanFilters, validateFilters } from "@/lib/analytics";
import { useAnalytics } from "@/lib/use-analytics";
import { senseLabel } from "@/lib/checklist";
import { EmptyState, LoadingBlock, PageHeader, Panel } from "@/components/app/kit";
import { Delta, FiltersBar, ScoreMedal } from "@/components/app/analytics-ui";
import { HistoryChart, SectorRanking } from "@/components/app/analytics-sections";

export const Route = createFileRoute("/_authenticated/analise/senso/$code")({
  validateSearch: validateFilters,
  head: () => ({
    meta: [
      { title: "Análise do Senso — Prestek 5S" },
      { name: "description", content: "Unidades, setores e perguntas com pior resultado no senso e sua evolução." },
      { property: "og:title", content: "Análise do Senso — Prestek 5S" },
      { property: "og:description", content: "Unidades, setores e perguntas com pior resultado no senso e sua evolução." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { code } = Route.useParams();
  const search = Route.useSearch();
  const f = useMemo(() => ({ ...search, sense: code }), [search, code]);
  const { loading, data } = useAnalytics(f);
  if (loading || !data) return <Panel><LoadingBlock /></Panel>;
  const { cur, prev, medals } = data;
  const worstSectors = { ...cur, sectorScores: [...cur.sectorScores].reverse().slice(0, 10) };
  const worstUnits = [...cur.unitScores].reverse();
  const byNc = [...cur.topQuestions].filter((q) => q.nc).sort((a, b) => b.nc - a.nc).slice(0, 8);
  const byNcp = [...cur.topQuestions].filter((q) => q.ncp).sort((a, b) => b.ncp - a.ncp).slice(0, 8);
  const QList = ({ items, k }: { items: typeof byNc; k: "nc" | "ncp" }) => !items.length ? <p className="text-sm text-muted-foreground">Nenhuma ocorrência.</p> : (
    <ol className="grid gap-2 text-sm">{items.map((q, i) => <li key={q.key} className="flex gap-3"><span className="font-mono text-xs text-muted-foreground">{i + 1}.</span><span className="flex-1">{q.text}</span><b>{q[k]}</b></li>)}</ol>
  );
  return (
    <>
      <Link to="/dashboard" search={cleanFilters(search) as never} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Dashboard</Link>
      <PageHeader title={senseLabel(code)} subtitle="Análise do Senso" />
      <FiltersBar filters={search} show={["unit", "sector", "auditor"]} periodLabel={data.range.label} />
      <Panel>
        <div className="flex flex-wrap items-center gap-4">
          {cur.overall === null ? <span className="font-display text-xl font-bold text-muted-foreground">Nenhuma auditoria encontrada para este período.</span> : <ScoreMedal score={cur.overall} medals={medals} size="lg" />}
          {cur.overall !== null && <Delta value={prev.overall === null ? null : cur.overall - prev.overall} />}
          <span className="text-sm text-muted-foreground">NC {cur.nc} · NCP {cur.ncp}</span>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Unidades com menor resultado">
          {!worstUnits.length ? <EmptyState compact title="Sem dados no período." /> : (
            <ul className="grid gap-1.5">{worstUnits.map((u) => <li key={u.unit_id} className="flex justify-between text-sm"><span>{u.name}</span><ScoreMedal score={u.score} medals={medals} /></li>)}</ul>
          )}
        </Panel>
        <SectorRanking a={worstSectors} prev={data.prevSector} medals={medals} f={search} title="Setores com menor resultado" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Perguntas com mais NC"><QList items={byNc} k="nc" /></Panel>
        <Panel title="Perguntas com mais NCP"><QList items={byNcp} k="ncp" /></Panel>
        <HistoryChart data={data.history} title="Evolução do Senso" />
      </div>
    </>
  );
}
