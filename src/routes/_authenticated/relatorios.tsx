import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Printer } from "lucide-react";
import { listChangeLogs } from "@/lib/analytics.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { cleanFilters, deadlineOf, downloadCsv, isOverdue, localDay, medalOf, PLAN_STATUS, validateFilters } from "@/lib/analytics";
import { useAnalytics } from "@/lib/use-analytics";
import { CLASSIFICATION, answerLabel, formatScore, senseLabel } from "@/lib/checklist";
import { formatDate, formatDateTime } from "@/lib/format";
import { EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { DeadlineBadge, FiltersBar, ScoreMedal } from "@/components/app/analytics-ui";
import { CoverageBlock, HistoryChart, SenseBars } from "@/components/app/analytics-sections";
import { exportPlans } from "@/lib/plans-export";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios")({
  validateSearch: validateFilters,
  head: () => ({
    meta: [
      { title: "Relatórios — Prestek 5S" },
      { name: "description", content: "Relatórios de auditorias, desempenho, ranking, NC/NCP, plano de ação, cobertura e histórico." },
      { property: "og:title", content: "Relatórios — Prestek 5S" },
      { property: "og:description", content: "Relatórios de auditorias, desempenho, ranking, NC/NCP, plano de ação, cobertura e histórico." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const TABS = [["audits", "Auditorias"], ["performance", "Desempenho 5S"], ["ranking", "Ranking"], ["nc", "Não Conformidades"], ["plans", "Plano de Ação"], ["coverage", "Cobertura"], ["history", "Histórico"]] as const;
type Tab = (typeof TABS)[number][0];
const cls = (c: string | null) => (c ? `${CLASSIFICATION[c]?.emoji ?? ""} ${CLASSIFICATION[c]?.label ?? c}`.trim() : "");

function Page() {
  const f = Route.useSearch();
  const { role } = useAuth();
  const [tab, setTab] = useState<Tab>("audits");
  const [planFilter, setPlanFilter] = useState("all");
  const { loading, data } = useAnalytics(f);
  const logs = useQuery({
    queryKey: ["change-logs"], enabled: tab === "history" && can(role, "logs.view"),
    queryFn: () => listChangeLogs(),
  });
  if (!can(role, "reports.view")) return <Restricted />;

  const Actions = ({ onCsv }: { onCsv?: () => void }) => (
    <div className="flex gap-2 print:hidden">
      {onCsv && <Button size="sm" variant="outline" onClick={onCsv}><Download className="size-4" /> CSV</Button>}
      <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Imprimir / PDF</Button>
    </div>
  );

  let body: React.ReactNode = <LoadingBlock />;
  if (!loading && data) {
    const { cur, medals } = data;
    const alert = data.settings.deadline_alert_days;
    const byAudit = new Map(cur.scoped.map((a) => [a.id, a]));
    const planByAnswer = new Map(data.plans.map((p) => [p.audit_answer_id, p]));
    if (tab === "audits") {
      const list = cur.scoped;
      body = (
        <Panel title={`Auditorias concluídas — ${data.range.label}`} aside={<Actions onCsv={() => downloadCsv("auditorias", ["Auditoria", "Data", "Unidade", "Setor", "Auditor", "Nota", "Medalha", "NC", "NCP"],
          list.map((a) => [a.audit_number, formatDateTime(a.finished_at), a.unit_name_snapshot, a.sector_name_snapshot, a.auditor_name_snapshot, a.overall_score, cls(a.classification), a.nc_count, a.ncp_count]))} />}>
          {!list.length ? <EmptyState compact title="Nenhuma auditoria encontrada para este período." /> : (
            <Table><TableHeader><TableRow><TableHead>Auditoria</TableHead><TableHead>Data</TableHead><TableHead>Unidade / Setor</TableHead><TableHead>Auditor</TableHead><TableHead>Nota</TableHead><TableHead>NC/NCP</TableHead><TableHead className="print:hidden">PDF</TableHead></TableRow></TableHeader>
              <TableBody>{list.map((a) => (
                <TableRow key={a.id}><TableCell><Link to="/auditorias/$id" params={{ id: a.id }} className="font-mono text-primary">{a.audit_number}</Link></TableCell>
                  <TableCell>{formatDateTime(a.finished_at)}</TableCell><TableCell>{a.unit_name_snapshot}<span className="block text-xs text-muted-foreground">{a.sector_name_snapshot}</span></TableCell>
                  <TableCell>{a.auditor_name_snapshot}</TableCell><TableCell><ScoreMedal score={a.overall_score} cls={a.classification} /></TableCell><TableCell className="font-mono text-xs">{a.nc_count} / {a.ncp_count}</TableCell>
                  <TableCell className="print:hidden"><div className="flex gap-1">
                    <Button size="sm" variant="ghost" asChild><Link to="/imprimir/auditoria/$id" params={{ id: a.id }} search={{ mode: "completo" }}>Completo</Link></Button>
                    <Button size="sm" variant="ghost" asChild><Link to="/imprimir/auditoria/$id" params={{ id: a.id }} search={{ mode: "resumo" }}>Resumido</Link></Button></div></TableCell>
                </TableRow>))}</TableBody></Table>
          )}
        </Panel>
      );
    } else if (tab === "performance") {
      body = <div className="grid gap-4 lg:grid-cols-2"><SenseBars a={cur} f={f} medals={medals} /><HistoryChart data={data.history} /><div className="print:hidden lg:col-span-2"><Actions /></div></div>;
    } else if (tab === "ranking") {
      const rows = cur.sectorScores;
      body = (
        <Panel title="Relatório de Ranking" aside={<Actions onCsv={() => downloadCsv("ranking-setores", ["Posição", "Unidade", "Setor", "Nota", "Medalha", "Auditoria considerada", "Data", "Evolução (p.p.)"],
          rows.map((s, i) => { const pv = data.prevSector.get(s.sector_id); return [`${i + 1}º`, s.unit_name, s.sector_name, s.score.toFixed(1), cls(medalOf(s.score, medals)), s.audit.audit_number, formatDate(s.finished_at), pv === undefined ? "" : (s.score - pv).toFixed(1)]; }))} />}>
          {!rows.length ? <EmptyState compact title="Nenhuma auditoria encontrada para este período." /> : (
            <Table><TableHeader><TableRow><TableHead>Pos.</TableHead><TableHead>Unidade</TableHead><TableHead>Setor</TableHead><TableHead>Nota</TableHead><TableHead>Auditoria</TableHead><TableHead>Evolução</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((s, i) => { const pv = data.prevSector.get(s.sector_id); return (
                <TableRow key={s.sector_id}><TableCell>{i + 1}º</TableCell><TableCell>{s.unit_name}</TableCell><TableCell>{s.sector_name}</TableCell><TableCell><ScoreMedal score={s.score} medals={medals} /></TableCell>
                  <TableCell className="font-mono text-xs">{s.audit.audit_number} · {formatDate(s.finished_at)}</TableCell>
                  <TableCell className="text-xs">{pv === undefined ? "—" : `${s.score - pv >= 0 ? "↑" : "↓"} ${formatScore(Math.abs(s.score - pv)).replace("%", "")} p.p.`}</TableCell></TableRow>); })}</TableBody></Table>
          )}
        </Panel>
      );
    } else if (tab === "nc") {
      const rows = cur.answers.map((x) => ({ x, a: byAudit.get(x.audit_id)!, p: planByAnswer.get(x.id) }));
      body = (
        <Panel title="Relatório de Não Conformidades" aside={<Actions onCsv={() => downloadCsv("nao-conformidades", ["Unidade", "Setor", "Senso", "Pergunta", "Tipo", "Observação", "Auditor", "Data", "Auditoria", "Plano de Ação", "Status do plano"],
          rows.map(({ x, a, p }) => [a.unit_name_snapshot, a.sector_name_snapshot, senseLabel(x.sense_snapshot), x.question_snapshot, x.answer === "NON_COMPLIANT" ? "NC" : "NCP", x.observation, a.auditor_name_snapshot, formatDate(a.finished_at), a.audit_number, p?.what ?? "", p ? PLAN_STATUS[p.status] : ""]))} />}>
          {!rows.length ? <EmptyState compact title="Nenhuma Não Conformidade registrada." /> : (
            <Table><TableHeader><TableRow><TableHead>Unidade / Setor</TableHead><TableHead>Senso</TableHead><TableHead>Pergunta</TableHead><TableHead>Tipo</TableHead><TableHead>Observação</TableHead><TableHead>Auditor / Data</TableHead><TableHead>Plano</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map(({ x, a, p }) => (
                <TableRow key={x.id}><TableCell>{a.unit_name_snapshot}<span className="block text-xs text-muted-foreground">{a.sector_name_snapshot}</span></TableCell><TableCell className="text-xs">{senseLabel(x.sense_snapshot)}</TableCell>
                  <TableCell className="max-w-[260px] text-sm">{x.question_snapshot}</TableCell><TableCell className="font-mono text-xs text-destructive">{x.answer === "NON_COMPLIANT" ? "NC" : "NCP"}</TableCell>
                  <TableCell className="max-w-[220px] text-xs">{x.observation}</TableCell><TableCell className="text-xs">{a.auditor_name_snapshot}<br />{formatDate(a.finished_at)}</TableCell>
                  <TableCell className="text-xs">{p ? <Link to="/plano-de-acao/$id" params={{ id: p.id }} className="text-primary">{PLAN_STATUS[p.status]}</Link> : "—"}</TableCell></TableRow>))}</TableBody></Table>
          )}
        </Panel>
      );
    } else if (tab === "plans") {
      const rows = data.plans.filter((p) => {
        const d = localDay(p.audits?.finished_at ?? p.created_at);
        const inRange = d >= data.range.start && d <= data.range.end;
        if (planFilter === "overdue") return isOverdue(p);
        if (planFilter === "all_time") return true;
        return inRange && (planFilter === "all" || p.status === planFilter);
      });
      body = (
        <Panel title="Relatório de Plano de Ação" aside={<Actions onCsv={() => exportPlans(rows, alert)} />}>
          <div className="mb-4 w-full sm:w-72 print:hidden">
            <Select value={planFilter} onValueChange={setPlanFilter}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas do período</SelectItem><SelectItem value="all_time">Todas (qualquer período)</SelectItem>
                {Object.entries(PLAN_STATUS).map(([k, l]) => <SelectItem key={k} value={k}>{l} (período)</SelectItem>)}<SelectItem value="overdue">Vencidas (atual)</SelectItem></SelectContent></Select>
          </div>
          {!rows.length ? <EmptyState compact title={planFilter === "overdue" ? "Não existem ações vencidas." : "Nenhuma ação encontrada."} /> : (
            <Table><TableHeader><TableRow><TableHead>Unidade / Setor</TableHead><TableHead>Tipo / Pergunta</TableHead><TableHead>O quê / Como</TableHead><TableHead>Quem</TableHead><TableHead>Prazo</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((p) => (
                <TableRow key={p.id}><TableCell>{p.unit_name}<span className="block text-xs text-muted-foreground">{p.sector_name}</span></TableCell>
                  <TableCell className="max-w-[240px] text-sm"><span className="font-mono text-xs text-destructive">{p.nc_type}</span> {p.question}</TableCell>
                  <TableCell className="max-w-[240px] text-xs">{p.what ?? "—"}<span className="block text-muted-foreground">{p.how}</span></TableCell><TableCell className="text-sm">{p.who ?? "—"}</TableCell>
                  <TableCell><DeadlineBadge plan={p} alertDays={alert} /><span className="block text-xs text-muted-foreground">{formatDate(p.when_date)}</span></TableCell>
                  <TableCell className="text-xs">{PLAN_STATUS[p.status]} {deadlineOf(p, alert).code === "OVERDUE" ? "" : ""}</TableCell></TableRow>))}</TableBody></Table>
          )}
        </Panel>
      );
    } else if (tab === "coverage") {
      body = <div className="grid gap-4"><CoverageBlock a={cur} f={f} units={data.ctx.units} /><Actions onCsv={() => downloadCsv("cobertura", ["Unidade", "Setor", "Situação"],
        data.ctx.sectors.filter((s) => s.active && (!f.unit || s.unit_id === f.unit)).map((s) => [data.ctx.units.find((u) => u.id === s.unit_id)?.name, s.name, cur.latest.has(s.id) ? "Auditado" : "Pendente"]))} /></div>;
    } else {
      body = !can(role, "logs.view") ? <Restricted /> : (
        <Panel title="Histórico de alterações (logs)" aside={<Actions onCsv={() => downloadCsv("logs", ["Data", "Usuário", "Auditoria", "Entidade", "Campo", "Anterior", "Novo", "Motivo"],
          (logs.data ?? []).map((l) => [formatDateTime(l.changed_at), l.changed_by_name, l.audits?.audit_number, l.entity, l.field, l.previous_value, l.new_value, l.reason]))} />}>
          {logs.isLoading ? <LoadingBlock /> : !logs.data?.length ? <EmptyState compact title="Nenhuma alteração registrada." /> : (
            <Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Usuário</TableHead><TableHead>Auditoria</TableHead><TableHead>Alteração</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
              <TableBody>{logs.data.map((l) => (
                <TableRow key={l.id}><TableCell className="text-xs">{formatDateTime(l.changed_at)}</TableCell><TableCell className="text-sm">{l.changed_by_name ?? "—"}</TableCell>
                  <TableCell><Link to="/auditorias/$id" params={{ id: l.audit_id }} className="font-mono text-xs text-primary">{l.audits?.audit_number}</Link></TableCell>
                  <TableCell className="text-xs">{l.entity} · {l.field}: {fmt(l.previous_value)} → <b>{fmt(l.new_value)}</b></TableCell><TableCell className="max-w-[260px] text-xs">{l.reason}</TableCell></TableRow>))}</TableBody></Table>
          )}
        </Panel>
      );
    }
  }

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Análises e exportações"
        actions={<Button asChild><Link to="/relatorios/executivo" search={cleanFilters(f) as never}><FileText className="size-4" /> PDF Executivo</Link></Button>} />
      <div className="flex flex-wrap gap-1.5 print:hidden">
        {TABS.filter(([k]) => k !== "history" || can(role, "logs.view")).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3 py-1.5 text-sm", tab === k ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-foreground/5")}>{l}</button>
        ))}
      </div>
      {tab !== "history" && <FiltersBar filters={f} periodLabel={data?.range.label} />}
      {body}
    </>
  );
}
const fmt = (v: string | null) => (v ? (answerLabel(v) !== "Sem resposta" ? answerLabel(v) : PLAN_STATUS[v] ?? v) : "—");
