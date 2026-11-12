import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAudit, listAudits } from "@/lib/audits.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { classificationText, formatScore } from "@/lib/checklist";
import { formatDateTime, friendlyError } from "@/lib/format";
import { auditorsQuery, sectorsQuery, unitsQuery } from "@/lib/queries";
import { Kpi } from "@/components/app/analytics-ui";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/auditorias")({
  head: () => ({
    meta: [
      { title: "Auditorias — Prestek 5S" },
      { name: "description", content: "Consulta das auditorias 5S realizadas por setor." },
      { property: "og:title", content: "Auditorias — Prestek 5S" },
      { property: "og:description", content: "Consulta das auditorias 5S realizadas por setor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Row = {
  id: string; audit_number: string; unit_id: string; sector_id: string; unit_name_snapshot: string; sector_name_snapshot: string;
  auditor_id: string; auditor_name_snapshot: string; companion_name: string; started_at: string; finished_at: string | null;
  location_status: string; overall_score: number | null; classification: string | null; nc_count: number; ncp_count: number; status: string;
};

function Sel({ value, onChange, all, items, className }: { value: string; onChange: (v: string) => void; all: string; items: [string, string][]; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", className)}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="all">{all}</SelectItem>{items.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function DeleteAudit({ audit, onConfirm }: { audit: Row; onConfirm: () => Promise<void> }) {
  return (
    <ConfirmAction
      destructive
      title={`Excluir a auditoria ${audit.audit_number}?`}
      confirmLabel="Excluir"
      description={
        "Serão apagados definitivamente a auditoria, as respostas, as fotos, os planos de ação gerados por ela e o histórico de alterações. Esta ação não pode ser desfeita." +
        (audit.status === "COMPLETED" ? "" : " A auditoria está em andamento: o auditor em campo perderá o preenchimento.")
      }
      trigger={(open) => (
        <Button size="icon" variant="ghost" title="Excluir" aria-label={`Excluir auditoria ${audit.audit_number}`} onClick={open}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      )}
      onConfirm={onConfirm}
    />
  );
}

function Page() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const canDelete = can(role, "audits.delete");
  const audits = useQuery({
    queryKey: ["audits"],
    queryFn: async () => {
      return (await listAudits()) as Row[];
    },
  });
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const auditors = useQuery({ ...auditorsQuery, enabled: can(role, "people.view") });
  const [f, setF] = useState({ q: "", from: "", to: "", unit: "all", sector: "all", auditor: "all", status: "all", cls: "all" });
  const [page, setPage] = useState(0);

  const auditorItems = useMemo(() => {
    const m = new Map<string, string>();
    (audits.data ?? []).forEach((a) => m.set(a.auditor_id, a.auditor_name_snapshot));
    (auditors.data ?? []).forEach((a) => m.set(a.id, a.name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [audits.data, auditors.data]);

  const list = useMemo(() => (audits.data ?? []).filter((a) => {
    const d = a.started_at.slice(0, 10);
    return (!f.q || a.audit_number.toLowerCase().includes(f.q.toLowerCase())) &&
      (!f.from || d >= f.from) && (!f.to || d <= f.to) &&
      (f.unit === "all" || a.unit_id === f.unit) && (f.sector === "all" || a.sector_id === f.sector) &&
      (f.auditor === "all" || a.auditor_id === f.auditor) && (f.status === "all" || a.status === f.status) &&
      (f.cls === "all" || a.classification === f.cls);
  }), [audits.data, f]);
  const PAGE = 20;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const rows = list.slice(Math.min(page, pages - 1) * PAGE, Math.min(page, pages - 1) * PAGE + PAGE);
  const set = (k: keyof typeof f) => (v: string) => { setF({ ...f, [k]: v, ...(k === "unit" ? { sector: "all" } : {}) }); setPage(0); };

  if (!can(role, "audits.view")) return <Restricted />;
  const remove = async (a: Row) => {
    try { await deleteAudit({ data: { id: a.id } }); }
    catch (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Auditoria ${a.audit_number} excluída`);
    // A auditoria alimenta lista, indicadores, plano de ação, notificações e histórico: tudo é recarregado.
    for (const key of ["audits", "analytics", "action-plans", "notifications", "dashboard", "change-logs"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
  const status = (s: string) => s === "COMPLETED"
    ? <span className="text-xs font-medium text-success">Concluída</span>
    : <span className="text-xs font-medium text-muted-foreground">Em andamento</span>;

  return (
    <>
      <PageHeader title="Auditorias" subtitle="Histórico de auditorias 5S" />
      {(() => {
        const done = list.filter((a) => a.status === "COMPLETED" && a.overall_score !== null);
        const avg = done.length ? done.reduce((s, a) => s + Number(a.overall_score), 0) / done.length : null;
        const n = (c: string) => done.filter((a) => a.classification === c).length;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Auditorias no período" value={done.length} hint={list.length - done.length ? `${list.length - done.length} em andamento` : "Concluídas"} />
            <Kpi label="Média" value={avg === null ? "—" : formatScore(avg)} />
            <Kpi label="🥇 Ouro" value={n("OURO")} onClick={() => set("cls")("OURO")} />
            <Kpi label="🥈 Prata" value={n("PRATA")} onClick={() => set("cls")("PRATA")} />
            <Kpi label="🥉 Bronze" value={n("BRONZE")} onClick={() => set("cls")("BRONZE")} />
            <Kpi label="Sem índice" value={n("SEM_INDICE")} onClick={() => set("cls")("SEM_INDICE")} />
          </div>
        );
      })()}
      <Panel>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Nº da auditoria (AUD-…)" value={f.q} onChange={(e) => set("q")(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Input type="date" aria-label="De" value={f.from} onChange={(e) => set("from")(e.target.value)} />
            <Input type="date" aria-label="Até" value={f.to} onChange={(e) => set("to")(e.target.value)} />
          </div>
          <Sel value={f.unit} onChange={set("unit")} all="Todas as unidades" items={(units.data ?? []).map((u) => [u.id, u.name])} />
          <Sel value={f.sector} onChange={set("sector")} all="Todos os setores"
            items={(sectors.data ?? []).filter((s) => f.unit === "all" || s.unit_id === f.unit).map((s) => [s.id, s.name])} />
          <Sel value={f.auditor} onChange={set("auditor")} all="Todos os auditores" items={auditorItems} />
          <Sel value={f.status} onChange={set("status")} all="Todos os status" items={[["COMPLETED", "Concluída"], ["IN_PROGRESS", "Em andamento"]]} />
          <Sel value={f.cls} onChange={set("cls")} all="Todas as classificações" items={[["OURO", "🥇 Ouro"], ["PRATA", "🥈 Prata"], ["BRONZE", "🥉 Bronze"], ["SEM_INDICE", "Sem índice"]]} />
        </div>
      </Panel>
      {audits.isLoading ? <Panel><LoadingBlock /></Panel> : !audits.data?.length ? (
        <Panel><EmptyState title="Nenhuma auditoria realizada." description="As auditorias aparecerão aqui após a leitura do QR Code do setor pelos auditores." /></Panel>
      ) : (
        <Panel className="p-0 sm:p-0">
          {list.length === 0 ? <div className="p-5"><EmptyState compact title="Nenhuma auditoria encontrada." /></div> : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader><TableRow>
                    {["Número", "Data", "Unidade", "Setor", "Auditor", "Acompanhante", "Nota", "Classificação", "NC", "NCP", "Localização", "Status", ""].map((h, i) => (
                      <TableHead key={h + i} className={cn("eyebrow", i === 0 && "pl-6")}>{h}</TableHead>
                    ))}
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="pl-6 font-mono text-xs">{a.audit_number}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{formatDateTime(a.started_at)}</TableCell>
                        <TableCell>{a.unit_name_snapshot}</TableCell>
                        <TableCell>{a.sector_name_snapshot}</TableCell>
                        <TableCell>{a.auditor_name_snapshot}</TableCell>
                        <TableCell className="text-muted-foreground">{a.companion_name}</TableCell>
                        <TableCell className="font-medium">{a.status === "COMPLETED" ? formatScore(a.overall_score) : "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{a.status === "COMPLETED" ? classificationText(a.classification) : "—"}</TableCell>
                        <TableCell className={cn(a.nc_count > 0 && "font-semibold text-destructive")}>{a.status === "COMPLETED" ? a.nc_count : "—"}</TableCell>
                        <TableCell className={cn(a.ncp_count > 0 && "font-semibold text-destructive")}>{a.status === "COMPLETED" ? a.ncp_count : "—"}</TableCell>
                        <TableCell className="text-xs">{a.location_status === "REGISTERED" ? "Registrada" : "Não registrada"}</TableCell>
                        <TableCell>{status(a.status)}</TableCell>
                        <TableCell className="whitespace-nowrap pr-6 text-right">
                          <Button size="sm" variant="ghost" asChild><Link to="/auditorias/$id" params={{ id: a.id }}>Ver</Link></Button>
                          {canDelete && <DeleteAudit audit={a} onConfirm={() => remove(a)} />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="divide-y divide-border lg:hidden">
                {rows.map((a) => (
                  <div key={a.id} className="flex items-start hover:bg-foreground/5">
                    <Link to="/auditorias/$id" params={{ id: a.id }} className="block min-w-0 flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="font-mono text-xs">{a.audit_number}</p><p className="font-medium">{a.unit_name_snapshot} · {a.sector_name_snapshot}</p></div>
                        {status(a.status)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(a.started_at)} · {a.auditor_name_snapshot}</p>
                      {a.status === "COMPLETED" && <p className="mt-1 text-sm font-medium">{formatScore(a.overall_score)} · {classificationText(a.classification)} · NC {a.nc_count} · NCP {a.ncp_count}</p>}
                    </Link>
                    {canDelete && <div className="py-2 pr-2"><DeleteAudit audit={a} onConfirm={() => remove(a)} /></div>}
                  </div>
                ))}
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Página {Math.min(page, pages - 1) + 1} de {pages}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
                    <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>
      )}
    </>
  );
}
