import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { cleanFilters, validateFilters } from "@/lib/analytics";
import { useAnalytics } from "@/lib/use-analytics";
import { formatScore, senseLabel } from "@/lib/checklist";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { LoadingBlock, Panel, Restricted } from "@/components/app/kit";
import { FiltersBar, MedalChip, ScoreMedal } from "@/components/app/analytics-ui";
import { HistoryChart } from "@/components/app/analytics-sections";
import { PrintHeader } from "@/components/app/print";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/relatorios_/executivo")({
  validateSearch: validateFilters,
  head: () => ({
    meta: [
      { title: "Relatório Executivo 5S — Prestek 5S" },
      { name: "description", content: "Relatório executivo da auditoria 5S para a diretoria, em layout A4." },
      { property: "og:title", content: "Relatório Executivo 5S — Prestek 5S" },
      { property: "og:description", content: "Relatório executivo da auditoria 5S para a diretoria, em layout A4." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const f = Route.useSearch();
  const { role } = useAuth();
  const { loading, data } = useAnalytics(f);
  if (!can(role, "reports.view") && !can(role, "dashboard.view")) return <Restricted />;
  if (loading || !data) return <Panel><LoadingBlock /></Panel>;
  const { cur, prev, medals } = data;
  const delta = cur.overall !== null && prev.overall !== null ? cur.overall - prev.overall : null;
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name;
  const applied = [
    f.unit && `Unidade: ${name(data.ctx.units, f.unit)}`, f.sector && `Setor: ${name(data.ctx.sectors, f.sector)}`,
    f.sense && `Senso: ${senseLabel(f.sense)}`, f.auditor && `Auditor: ${data.ctx.audits.find((a) => a.auditor_id === f.auditor)?.auditor_name_snapshot}`,
  ].filter(Boolean).join(" · ") || "Nenhum";
  const H = ({ children }: { children: string }) => <h2 className="mt-6 text-sm font-bold uppercase tracking-wide">{children}</h2>;
  const Th = ({ children }: { children?: string }) => <th className="border border-border p-1.5 text-left font-medium">{children}</th>;
  const Td = ({ children, className }: { children: React.ReactNode; className?: string }) => <td className={`border border-border p-1.5 ${className ?? ""}`}>{children}</td>;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link to="/relatorios" search={cleanFilters(f) as never} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Relatórios</Link>
        <Button className="ml-auto" onClick={() => window.print()}><Printer className="size-4" /> Gerar PDF</Button>
      </div>
      <FiltersBar filters={f} periodLabel={data.range.label} />
      <article className="mx-auto w-full max-w-[210mm] bg-card p-8 text-[13px] shadow-sm print:p-0 print:shadow-none">
        <PrintHeader title="RELATÓRIO EXECUTIVO — AUDITORIA 5S" subtitle={`Período: ${data.range.label} · Filtros: ${applied}`} />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 rounded-lg border border-border p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Nota Geral 5S</p>
            {cur.overall === null ? <p className="font-bold">Sem auditoria no período</p> : <ScoreMedal score={cur.overall} medals={medals} size="lg" />}
            <p className="text-xs text-muted-foreground">{delta === null ? "Sem base no período anterior" : `${delta >= 0 ? "↑" : "↓"} ${formatScore(Math.abs(delta)).replace("%", "")} p.p. vs ${data.range.prev.label}`}</p>
          </div>
          {[["Cobertura", `${cur.coverage.done}/${cur.coverage.total} — ${cur.coverage.pct === null ? "—" : formatScore(cur.coverage.pct)}`], ["Auditorias", cur.auditsCount],
            ["Não Conformidades", cur.nc], ["NC Parciais", cur.ncp], ["Planos pendentes", data.openPlans.length], ["Ações vencidas", data.overduePlans.length]].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-border p-3"><p className="text-[10px] uppercase text-muted-foreground">{k}</p><p className="font-display text-xl font-bold">{v}</p></div>
          ))}
        </div>

        <H>Desempenho por Senso</H>
        <table className="mt-2 w-full border-collapse text-xs"><thead><tr><Th>Senso</Th><Th>Nota</Th><Th>NC</Th><Th>NCP</Th></tr></thead>
          <tbody>{cur.senses.map((s) => <tr key={s.code}><Td>{s.label}</Td><Td><ScoreMedal score={s.score} medals={medals} /></Td><Td>{s.nc}</Td><Td>{s.ncp}</Td></tr>)}</tbody></table>

        <div className="print-avoid mt-4"><HistoryChart data={data.history} /></div>

        <H>Ranking de Unidades</H>
        {!cur.unitScores.length ? <p className="mt-2 text-muted-foreground">Nenhuma auditoria encontrada para este período.</p> : (
          <table className="mt-2 w-full border-collapse text-xs"><thead><tr><Th>Pos.</Th><Th>Unidade</Th><Th>Nota</Th><Th>Medalha</Th><Th>Cobertura</Th></tr></thead>
            <tbody>{cur.unitScores.map((u, i) => <tr key={u.unit_id}><Td>{i + 1}º</Td><Td>{u.name}</Td><Td>{formatScore(u.score)}</Td><Td><MedalChip code={medalOfSafe(u.score, medals)} /></Td><Td>{u.coverage.done}/{u.coverage.total}</Td></tr>)}
              {cur.unitsWithout.map((u) => <tr key={u.id}><Td>—</Td><Td>{u.name}</Td><Td className="text-muted-foreground">Sem auditoria no período</Td><Td>{""}</Td><Td>{""}</Td></tr>)}</tbody></table>
        )}

        <H>Ranking de Setores</H>
        {!cur.sectorScores.length ? <p className="mt-2 text-muted-foreground">Nenhuma auditoria encontrada para este período.</p> : (
          <table className="mt-2 w-full border-collapse text-xs"><thead><tr><Th>Pos.</Th><Th>Setor</Th><Th>Unidade</Th><Th>Nota</Th><Th>Medalha</Th><Th>Última auditoria</Th></tr></thead>
            <tbody>{cur.sectorScores.map((s, i) => <tr key={s.sector_id} className="print-avoid"><Td>{i + 1}º</Td><Td>{s.sector_name}</Td><Td>{s.unit_name}</Td><Td>{formatScore(s.score)}</Td><Td><MedalChip code={medalOfSafe(s.score, medals)} /></Td><Td>{formatDate(s.finished_at)}</Td></tr>)}</tbody></table>
        )}

        <H>Principais Não Conformidades</H>
        {!cur.topQuestions.length ? <p className="mt-2 text-muted-foreground">Nenhuma Não Conformidade registrada.</p> : (
          <ol className="mt-2 grid gap-1">{cur.topQuestions.slice(0, 10).map((q, i) => <li key={q.key}>{i + 1}. {q.text} — <b>{q.nc + q.ncp} ocorrências</b> <span className="text-muted-foreground">(NC {q.nc} · NCP {q.ncp})</span></li>)}</ol>
        )}
        {cur.pending.length > 0 && (<><H>Setores pendentes</H><p className="mt-2">{cur.pending.map((s) => s.name).join(", ")}</p></>)}
      </article>
    </>
  );
}
import { medalOf, type Medals } from "@/lib/analytics";
const medalOfSafe = (s: number, m: Medals) => medalOf(s, m) ?? "SEM_INDICE";
