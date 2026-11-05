import { useMemo, useState } from "react";
import { type SearchSchemaInput, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { exportPlans } from "@/lib/plans-export";
import { deadlineOf, isOverdue, localDay, PLAN_STATUS, plansQuery } from "@/lib/analytics";
import { SENSES, senseLabel } from "@/lib/checklist";
import { formatCurrency, formatDate } from "@/lib/format";
import { sectorsQuery, settingsQuery, unitsQuery } from "@/lib/queries";
import { EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { DeadlineBadge, Kpi } from "@/components/app/analytics-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/plano-de-acao")({
  validateSearch: (s: { prazo?: string } & SearchSchemaInput) => ({ prazo: typeof s.prazo === "string" ? s.prazo : "" }),
  head: () => ({
    meta: [
      { title: "Plano de Ação 5W2H — Prestek 5S" },
      { name: "description", content: "Ações 5W2H geradas pelas Não Conformidades das auditorias 5S." },
      { property: "og:title", content: "Plano de Ação 5W2H — Prestek 5S" },
      { property: "og:description", content: "Ações 5W2H geradas pelas Não Conformidades das auditorias 5S." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Sel({ value, onChange, all, items }: { value: string; onChange: (v: string) => void; all: string; items: [string, string][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">{all}</SelectItem>{items.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export const DEADLINE_FILTERS: [string, string][] = [["OVERDUE", "Vencidas"], ["TODAY", "Vence hoje"], ["SOON", "Próximas do prazo"], ["OK", "No prazo"], ["NONE", "Prazo não definido"], ["DONE", "Concluídas"]];

function Page() {
  const { role } = useAuth();
  const { prazo } = Route.useSearch();
  const plans = useQuery(plansQuery);
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const settings = useQuery(settingsQuery);
  const alert = settings.data?.deadline_alert_days ?? 3;
  const [f, setF] = useState({ q: "", from: "", to: "", status: "all", unit: "all", sector: "all", sense: "all", type: "all", who: "", deadline: prazo || "all" });
  const [page, setPage] = useState(0);
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v, ...(k === "unit" ? { sector: "all" } : {}) }); setPage(0); };

  const list = useMemo(() => (plans.data ?? []).filter((p) => {
    const d = localDay(p.audits?.finished_at ?? p.created_at);
    const q = f.q.toLowerCase();
    return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (f.status === "all" || p.status === f.status) &&
      (f.unit === "all" || p.unit_id === f.unit) && (f.sector === "all" || p.sector_id === f.sector) && (f.sense === "all" || p.sense === f.sense) &&
      (f.type === "all" || p.nc_type === f.type) && (!f.who || (p.who ?? "").toLowerCase().includes(f.who.toLowerCase())) &&
      (f.deadline === "all" || deadlineOf(p, alert).code === f.deadline) &&
      (!q || [p.question, p.occurrence, p.what, p.how, p.who, p.sector_name, p.unit_name, p.audits?.audit_number].some((x) => (x ?? "").toLowerCase().includes(q)));
  }), [plans.data, f, alert]);

  if (!can(role, "actionPlans.view")) return <Restricted />;
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = list.slice(cur * PAGE, cur * PAGE + PAGE);
  const all = plans.data ?? [];

  return (
    <>
      <PageHeader title="Plano de Ação 5W2H" subtitle="Tratativa das Não Conformidades"
        actions={<Button variant="outline" disabled={!list.length} onClick={() => exportPlans(list, alert)}><Download className="size-4" /> Exportar CSV</Button>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Pendentes" value={all.filter((p) => p.status === "PENDENTE").length} onClick={() => set("status")("PENDENTE")} />
        <Kpi label="Em andamento" value={all.filter((p) => p.status === "EM_ANDAMENTO").length} onClick={() => set("status")("EM_ANDAMENTO")} />
        <Kpi label="Vencidas" value={all.filter(isOverdue).length} tone={all.some(isOverdue) ? "danger" : undefined} onClick={() => set("deadline")("OVERDUE")} />
        <Kpi label="Sem prazo" value={all.filter((p) => deadlineOf(p, alert).code === "NONE").length} onClick={() => set("deadline")("NONE")} />
        <Kpi label="Concluídas" value={all.filter((p) => p.status === "CONCLUIDO").length} onClick={() => set("status")("CONCLUIDO")} />
      </div>
      <Panel>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por pergunta, ocorrência, ação, auditoria…" value={f.q} onChange={(e) => set("q")(e.target.value)} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Input type="date" aria-label="De" value={f.from} onChange={(e) => set("from")(e.target.value)} />
            <Input type="date" aria-label="Até" value={f.to} onChange={(e) => set("to")(e.target.value)} />
          </div>
          <Sel value={f.status} onChange={set("status")} all="Todos os status" items={Object.entries(PLAN_STATUS)} />
          <Sel value={f.deadline} onChange={set("deadline")} all="Qualquer prazo" items={DEADLINE_FILTERS} />
          <Sel value={f.unit} onChange={set("unit")} all="Todas as unidades" items={(units.data ?? []).map((u) => [u.id, u.name])} />
          <Sel value={f.sector} onChange={set("sector")} all="Todos os setores" items={(sectors.data ?? []).filter((s) => f.unit === "all" || s.unit_id === f.unit).map((s) => [s.id, s.name])} />
          <Sel value={f.sense} onChange={set("sense")} all="Todos os sensos" items={SENSES.map((s) => [s.code, s.label])} />
          <Sel value={f.type} onChange={set("type")} all="NC e NCP" items={[["NC", "Não Conforme"], ["NCP", "Não Conforme Parcial"]]} />
          <Input placeholder="Responsável" value={f.who} onChange={(e) => set("who")(e.target.value)} />
        </div>
      </Panel>
      {plans.isLoading ? <Panel><LoadingBlock /></Panel> : !list.length ? (
        <Panel><EmptyState title={all.length ? "Nenhuma ação encontrada com estes filtros." : "Nenhum plano de ação registrado."} description="Cada Não Conformidade ou NC Parcial de uma auditoria concluída gera uma ação." /></Panel>
      ) : (
        <Panel>
          {/* Mobile cards */}
          <ul className="grid gap-2 md:hidden">
            {rows.map((p) => (
              <li key={p.id}><Link to="/plano-de-acao/$id" params={{ id: p.id }} className="block rounded-xl border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs">{p.nc_type} · {p.audits?.audit_number}</span><DeadlineBadge plan={p} alertDays={alert} /></div>
                <p className="mt-1 font-medium">{p.question}</p>
                <p className="mt-1 text-xs text-muted-foreground">{p.unit_name} / {p.sector_name} · {senseLabel(p.sense)} · {PLAN_STATUS[p.status]}{p.who ? ` · ${p.who}` : ""}</p>
              </Link></li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Status</TableHead><TableHead>Unidade / Setor</TableHead><TableHead>Senso</TableHead><TableHead>Tipo</TableHead><TableHead>Ocorrência</TableHead>
                <TableHead>Responsável</TableHead><TableHead>Prazo</TableHead><TableHead>Situação</TableHead><TableHead>Auditoria</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>{rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{PLAN_STATUS[p.status]}{p.origin_changed && <span className="block text-[10px] text-warning-foreground text-muted-foreground">Origem alterada</span>}</TableCell>
                  <TableCell className="text-sm">{p.unit_name}<span className="block text-xs text-muted-foreground">{p.sector_name}</span></TableCell>
                  <TableCell className="text-xs">{senseLabel(p.sense)}</TableCell>
                  <TableCell><span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive">{p.nc_type}</span></TableCell>
                  <TableCell className="max-w-[280px] text-sm"><span className="line-clamp-2">{p.occurrence || p.question}</span></TableCell>
                  <TableCell className="text-sm">{p.who || "—"}</TableCell>
                  <TableCell className="text-sm">{formatDate(p.when_date)}</TableCell>
                  <TableCell><DeadlineBadge plan={p} alertDays={alert} /></TableCell>
                  <TableCell><Link to="/auditorias/$id" params={{ id: p.audit_id }} className="font-mono text-xs text-primary hover:underline">{p.audits?.audit_number}</Link></TableCell>
                  <TableCell><Button size="sm" variant="outline" asChild><Link to="/plano-de-acao/$id" params={{ id: p.id }}>Abrir</Link></Button></TableCell>
                </TableRow>))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{list.length} ação(ões)</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Anterior</Button>
              <span className="self-center">{cur + 1} / {pages}</span>
              <Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Próxima</Button>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

