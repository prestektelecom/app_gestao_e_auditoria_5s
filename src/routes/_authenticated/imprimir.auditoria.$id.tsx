import { useEffect, useMemo, useState } from "react";
import { type SearchSchemaInput, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { getAuditForPrint, getEvidenceUrls } from "@/lib/audits.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PLAN_STATUS } from "@/lib/analytics";
import { LOCATION_LABEL, SENSES, answerLabel, classificationText, formatScore, requiresEvidence, senseLabel } from "@/lib/checklist";
import { formatDate, formatDateTime } from "@/lib/format";
import { EmptyState, LoadingBlock, Panel, Restricted } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { PrintHeader } from "@/components/app/print";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/imprimir/auditoria/$id")({
  validateSearch: (s: { mode?: string } & SearchSchemaInput) => ({ mode: s.mode === "resumo" ? "resumo" : "completo" }),
  head: () => ({
    meta: [
      { title: "PDF da Auditoria — Prestek 5S" },
      { name: "description", content: "Relatório completo ou resumido da auditoria 5S para impressão em A4." },
      { property: "og:title", content: "PDF da Auditoria — Prestek 5S" },
      { property: "og:description", content: "Relatório completo ou resumido da auditoria 5S para impressão em A4." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const { role } = useAuth();
  const full = mode === "completo";
  const q = useQuery({
    queryKey: ["audit-print", id],
    queryFn: async () => {
      return getAuditForPrint({ data: { id } });
    },
  });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const evs = useMemo(() => {
    const list = q.data?.evidences ?? [];
    return full ? list : list.slice(0, 6);
  }, [q.data, full]);
  useEffect(() => {
    const paths = evs.map((e) => e.storage_path);
    if (!paths.length) return;
    getEvidenceUrls({ data: { paths } }).then(setUrls).catch(() => setUrls({}));
  }, [evs]);

  if (!can(role, "audits.view")) return <Restricted />;
  if (q.isLoading) return <Panel><LoadingBlock /></Panel>;
  const a = q.data?.audit;
  if (!a) return <Panel><EmptyState title="Auditoria não encontrada." /></Panel>;
  const bad = q.data!.answers.filter((x) => requiresEvidence(x.answer));
  const ident: [string, string][] = [
    ["Unidade", a.unit_name_snapshot], ["Setor", a.sector_name_snapshot], ["Auditor", a.auditor_name_snapshot], ["Acompanhante", a.companion_name],
    ["Data", formatDate(a.started_at)], ["Hora inicial", formatDateTime(a.started_at).split(" ").pop()!], ["Hora final", a.finished_at ? formatDateTime(a.finished_at).split(" ").pop()! : "—"],
    ["Versão do checklist", a.checklist_version_snapshot], ["Localização", LOCATION_LABEL[a.location_status] ?? a.location_status],
    ["Coordenadas", a.latitude != null ? `${a.latitude.toFixed(6)}, ${a.longitude?.toFixed(6)}` : "—"],
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link to="/auditorias/$id" params={{ id }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Voltar à auditoria</Link>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" asChild><Link to="/imprimir/auditoria/$id" params={{ id }} search={{ mode: full ? "resumo" : "completo" }}>Ver {full ? "resumido" : "completo"}</Link></Button>
          <Button onClick={() => window.print()}><Printer className="size-4" /> Gerar PDF</Button>
        </div>
        <p className="w-full text-xs text-muted-foreground">Na janela de impressão, escolha “Salvar como PDF”. Layout A4.</p>
      </div>

      <article className="mx-auto w-full max-w-[210mm] bg-card p-8 text-[13px] shadow-sm print:p-0 print:shadow-none">
        <PrintHeader title={`AUDITORIA 5S — ${a.audit_number}`} subtitle={full ? "Relatório completo" : "Relatório resumido"} />

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide">Identificação</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
          {ident.map(([k, v]) => <div key={k}><dt className="text-[10px] uppercase text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p className="mt-3 rounded border border-border p-2 text-[11px] text-muted-foreground">
          Autoria registrada: auditor <b className="text-foreground">{a.auditor_name_snapshot}</b>, identificado por código pessoal no início da auditoria em {formatDateTime(a.started_at)}{a.finished_at ? `, finalizada em ${formatDateTime(a.finished_at)}` : ""}.
        </p>

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide">Resultado</h2>
        <div className="mt-2 flex flex-wrap items-center gap-6">
          <p className="font-display text-3xl font-bold">{formatScore(a.overall_score)} <span className="text-lg">— {classificationText(a.classification)}</span></p>
          <p>Conforme <b>{a.compliant_count}</b> · NCP <b>{a.ncp_count}</b> · NC <b>{a.nc_count}</b> · N/A <b>{a.na_count}</b></p>
        </div>
        <table className="mt-3 w-full border-collapse text-xs">
          <thead><tr>{SENSES.map((s) => <th key={s.code} className="border border-border p-1.5 text-left font-medium">{s.label}</th>)}</tr></thead>
          <tbody><tr>{SENSES.map((s) => <td key={s.code} className="border border-border p-1.5 font-mono">{formatScore((a.sense_scores as Record<string, number | null>)?.[s.code])}</td>)}</tr></tbody>
        </table>

        {full ? (
          <>
            <h2 className="mt-6 text-sm font-bold uppercase tracking-wide">Checklist completo</h2>
            <table className="mt-2 w-full border-collapse text-xs">
              <thead><tr className="bg-muted"><th className="border border-border p-1.5">Nº</th><th className="border border-border p-1.5 text-left">Senso</th><th className="border border-border p-1.5 text-left">Pergunta</th><th className="border border-border p-1.5 text-left">Resposta</th><th className="border border-border p-1.5 text-left">Observação</th></tr></thead>
              <tbody>{q.data!.answers.map((r) => {
                const photos = evs.filter((e) => e.audit_answer_id === r.id);
                return (
                  <tr key={r.id} className="print-avoid align-top">
                    <td className="border border-border p-1.5 text-center font-mono">{r.order_snapshot}</td>
                    <td className="border border-border p-1.5">{senseLabel(r.sense_snapshot)}</td>
                    <td className="border border-border p-1.5">{r.question_snapshot}</td>
                    <td className={cn("border border-border p-1.5 font-medium", requiresEvidence(r.answer) && "text-destructive")}>{answerLabel(r.answer)}</td>
                    <td className="border border-border p-1.5">{r.observation}
                      {photos.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{photos.map((e) => urls[e.storage_path] && <img key={e.id} src={urls[e.storage_path]} alt="Evidência" className="h-20 w-24 rounded object-cover" />)}</div>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </>
        ) : (
          <>
            <h2 className="mt-6 text-sm font-bold uppercase tracking-wide">Principais ocorrências</h2>
            {!bad.length ? <p className="mt-2 text-muted-foreground">Nenhuma Não Conformidade registrada.</p> : (
              <ul className="mt-2 grid gap-1.5">{bad.map((r) => <li key={r.id} className="print-avoid"><b className="text-destructive">{r.answer === "NON_COMPLIANT" ? "NC" : "NCP"}</b> · {r.order_snapshot}. {r.question_snapshot} <span className="text-muted-foreground">— {r.observation}</span></li>)}</ul>
            )}
            {evs.length > 0 && (<>
              <h2 className="mt-6 text-sm font-bold uppercase tracking-wide">Principais fotos</h2>
              <div className="mt-2 grid grid-cols-3 gap-2">{evs.map((e) => urls[e.storage_path] && <img key={e.id} src={urls[e.storage_path]} alt="Evidência" className="aspect-[4/3] w-full rounded object-cover" />)}</div>
            </>)}
          </>
        )}

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide">Plano de Ação</h2>
        {!q.data!.plans.length ? <p className="mt-2 text-muted-foreground">Nenhuma ação originada desta auditoria.</p> : (
          <table className="mt-2 w-full border-collapse text-xs">
            <thead><tr className="bg-muted"><th className="border border-border p-1.5 text-left">Tipo</th><th className="border border-border p-1.5 text-left">Pergunta</th>{full && <th className="border border-border p-1.5 text-left">O quê</th>}<th className="border border-border p-1.5 text-left">Responsável</th><th className="border border-border p-1.5 text-left">Prazo</th><th className="border border-border p-1.5 text-left">Status</th></tr></thead>
            <tbody>{q.data!.plans.map((p) => (
              <tr key={p.id} className="print-avoid align-top"><td className="border border-border p-1.5">{p.nc_type}</td><td className="border border-border p-1.5">{p.question}</td>
                {full && <td className="border border-border p-1.5">{p.what ?? "—"}</td>}<td className="border border-border p-1.5">{p.who ?? "—"}</td>
                <td className="border border-border p-1.5">{p.when_date ? formatDate(p.when_date) : "Prazo não definido"}</td>
                <td className="border border-border p-1.5">{PLAN_STATUS[p.status]}{p.origin_changed ? " (origem alterada)" : ""}</td></tr>))}</tbody>
          </table>
        )}
        <p className="mt-8 border-t border-border pt-2 text-[10px] text-muted-foreground">Documento gerado em {formatDateTime(new Date().toISOString())} · Dados conforme registrados no momento da auditoria.</p>
      </article>
    </>
  );
}
