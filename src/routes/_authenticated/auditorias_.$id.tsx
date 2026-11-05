import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, MapPin, Pencil } from "lucide-react";
import { PLAN_STATUS } from "@/lib/analytics";
import { toast } from "sonner";
import { adminUpdateAnswer, getAudit, getEvidenceUrls, listAuditLogs, listAuditPlans } from "@/lib/audits.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ANSWERS, LOCATION_LABEL, SENSES, answerLabel, classificationText, formatScore, requiresEvidence, senseLabel, type AnswerValue } from "@/lib/checklist";
import { formatDateTime } from "@/lib/format";
import { EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { Field } from "@/components/app/unit-sector-forms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/auditorias_/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe da Auditoria — Prestek 5S" },
      { name: "description", content: "Respostas, evidências, notas por senso e localização da auditoria." },
      { property: "og:title", content: "Detalhe da Auditoria — Prestek 5S" },
      { property: "og:description", content: "Respostas, evidências, notas por senso e localização da auditoria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Detail,
});

type Audit = {
  id: string; audit_number: string; unit_name_snapshot: string; sector_name_snapshot: string; auditor_name_snapshot: string;
  companion_name: string; started_at: string; finished_at: string | null; checklist_version_snapshot: string; latitude: number | null;
  longitude: number | null; location_status: string; overall_score: number | null; classification: string | null;
  sense_scores: Record<string, number | null>; compliant_count: number; nc_count: number; ncp_count: number; na_count: number; status: string;
};
type Ans = { id: string; question_snapshot: string; sense_snapshot: string; order_snapshot: number; answer: string | null; observation: string | null };
type Ev = { id: string; audit_answer_id: string; storage_path: string };
type Log = { id: string; changed_by_name: string | null; entity: string; field: string; previous_value: string | null; new_value: string | null; reason: string; changed_at: string };


function Detail() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["audit", id],
    queryFn: async () => {
      const r = await getAudit({ data: { id } });
      return { audit: r.audit as unknown as Audit | null, answers: r.answers as Ans[], evidences: r.evidences as Ev[] };
    },
  });
  const logs = useQuery({
    queryKey: ["audit-logs", id], enabled: can(role, "audits.logs"),
    queryFn: async () => {
      return (await listAuditLogs({ data: { auditId: id } })) as Log[];
    },
  });
  const plans = useQuery({
    queryKey: ["audit-plans", id],
    queryFn: async () => (await listAuditPlans({ data: { auditId: id } })) as { id: string; question: string; nc_type: string; status: string; who: string | null; when_date: string | null; origin_changed: boolean }[],
  });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [edit, setEdit] = useState<Ans | null>(null);

  useEffect(() => {
    const paths = (q.data?.evidences ?? []).map((e) => e.storage_path);
    if (!paths.length) return;
    getEvidenceUrls({ data: { paths } }).then(setUrls).catch(() => setUrls({}));
  }, [q.data?.evidences]);

  const grouped = useMemo(() => SENSES.map((s) => ({ s, list: (q.data?.answers ?? []).filter((a) => a.sense_snapshot === s.code) })).filter((g) => g.list.length), [q.data]);

  if (!can(role, "audits.view")) return <Restricted />;
  if (q.isLoading) return <Panel><LoadingBlock /></Panel>;
  const a = q.data?.audit;
  if (!a) return <Panel><EmptyState title="Auditoria não encontrada." action={<Button asChild variant="outline"><Link to="/auditorias">Voltar</Link></Button>} /></Panel>;
  const done = a.status === "COMPLETED";
  const canEdit = done && can(role, "audits.edit");

  return (
    <>
      <Link to="/auditorias" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Auditorias</Link>
      <PageHeader title={a.audit_number} subtitle={done ? "Auditoria concluída" : "Auditoria em andamento"} actions={done && (
        <>
          <Button variant="outline" asChild><Link to="/imprimir/auditoria/$id" params={{ id }} search={{ mode: "resumo" }}><FileText className="size-4" /> Gerar PDF Resumido</Link></Button>
          <Button asChild><Link to="/imprimir/auditoria/$id" params={{ id }} search={{ mode: "completo" }}><FileText className="size-4" /> Gerar PDF Completo</Link></Button>
        </>
      )} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel label="a" title="Identificação" className="lg:col-span-2" tape>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[["Unidade", a.unit_name_snapshot], ["Setor", a.sector_name_snapshot], ["Auditor", a.auditor_name_snapshot], ["Acompanhante", a.companion_name],
              ["Início", formatDateTime(a.started_at)], ["Conclusão", formatDateTime(a.finished_at)], ["Versão do checklist", a.checklist_version_snapshot]]
              .map(([k, v]) => <div key={k}><dt className="eyebrow">{k}</dt><dd className="mt-1 text-sm">{v}</dd></div>)}
          </dl>
        </Panel>
        <Panel label="b" title="Localização">
          <p className="text-sm">{LOCATION_LABEL[a.location_status]}</p>
          {a.latitude != null && <p className="mt-1 font-mono text-xs text-muted-foreground">{a.latitude.toFixed(6)}, {a.longitude?.toFixed(6)}</p>}
          {can(role, "audits.map") && <Button className="mt-4" variant="outline" onClick={() => setMapOpen(true)}><MapPin className="size-4" /> VER LOCALIZAÇÃO NO MAPA</Button>}
        </Panel>
      </div>

      {done && (
        <Panel label="c" title="Resultado">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="empty-well grid place-items-center py-6 text-center">
              <p className="eyebrow">Nota Geral</p>
              <p className="mt-1 font-display text-4xl font-bold">{formatScore(a.overall_score)}</p>
              <p className="mt-1 font-semibold">{formatScore(a.overall_score)} — {classificationText(a.classification)}</p>
            </div>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {SENSES.map((s) => (
                  <div key={s.code} className="empty-well p-3"><p className="eyebrow truncate">{s.label}</p><p className="mt-1 font-display text-lg font-bold">{formatScore(a.sense_scores?.[s.code])}</p></div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>Conforme: <b>{a.compliant_count}</b></span><span className="text-destructive">NCP: <b>{a.ncp_count}</b></span>
                <span className="text-destructive">NC: <b>{a.nc_count}</b></span><span>N/A: <b>{a.na_count}</b></span>
              </div>
            </div>
          </div>
        </Panel>
      )}

      <Panel label="d" title="Checklist">
        <div className="grid gap-6">
          {grouped.map(({ s, list }) => (
            <div key={s.code}>
              <h3 className="mb-2 text-sm font-semibold">{senseLabel(s.code)}</h3>
              <ul className="grid gap-2">
                {list.map((r) => {
                  const bad = requiresEvidence(r.answer);
                  const evs = (q.data?.evidences ?? []).filter((e) => e.audit_answer_id === r.id);
                  return (
                    <li key={r.id} className={cn("rounded-xl border p-3", bad ? "border-destructive/40 bg-destructive/5" : "border-border")}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                        <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{String(r.order_snapshot).padStart(2, "0")}</span>
                        <p className="flex-1 text-sm">{r.question_snapshot}</p>
                        <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                          r.answer === "COMPLIANT" ? "bg-success/10 text-success" : bad ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>{answerLabel(r.answer)}</span>
                        {canEdit && <Button size="icon" variant="ghost" className="size-7" onClick={() => setEdit(r)} aria-label="Alterar"><Pencil className="size-3.5" /></Button>}
                      </div>
                      {r.observation && <p className="mt-2 pl-0 text-sm text-muted-foreground sm:pl-10">{r.observation}</p>}
                      {evs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2 sm:pl-10">
                          {evs.map((e) => urls[e.storage_path]
                            ? <img key={e.id} src={urls[e.storage_path]} alt="Evidência" onClick={() => setViewer(urls[e.storage_path]!)} className="size-20 cursor-pointer rounded-lg border border-border object-cover" />
                            : <div key={e.id} className="size-20 rounded-lg bg-muted" />)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      {(plans.data?.length ?? 0) > 0 && (
        <Panel title="Plano de Ação desta auditoria">
          <ul className="grid gap-2">{plans.data!.map((p) => (
            <li key={p.id}><Link to="/plano-de-acao/$id" params={{ id: p.id }} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3 text-sm hover:bg-foreground/5">
              <span className="font-mono text-xs text-destructive">{p.nc_type}</span><span className="flex-1">{p.question}</span>
              <span className="text-xs text-muted-foreground">{p.who ?? "Sem responsável"} · {p.when_date ?? "Prazo não definido"}</span>
              <span className="text-xs font-medium">{PLAN_STATUS[p.status]}{p.origin_changed ? " · origem alterada" : ""}</span>
            </Link></li>))}</ul>
        </Panel>
      )}

      {can(role, "audits.logs") && (logs.data?.length ?? 0) > 0 && (
        <Panel label="e" title="Histórico de alterações">
          <ul className="grid gap-2 text-sm">
            {logs.data!.map((l) => (
              <li key={l.id} className="empty-well p-3">
                <p className="text-xs text-muted-foreground">{formatDateTime(l.changed_at)} · {l.changed_by_name ?? "—"} · {l.entity} / {l.field}</p>
                <p className="mt-1">{fmtLog(l.previous_value)} → <b>{fmtLog(l.new_value)}</b></p>
                <p className="mt-1 text-muted-foreground">Motivo: {l.reason}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Localização da auditoria</DialogTitle></DialogHeader>
          {a.latitude != null && a.longitude != null ? (
            <>
              <iframe title="Mapa" className="h-96 w-full rounded-lg border border-border"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${a.longitude - 0.004},${a.latitude - 0.003},${a.longitude + 0.004},${a.latitude + 0.003}&layer=mapnik&marker=${a.latitude},${a.longitude}`} />
              <a className="text-sm text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}>Abrir no Google Maps</a>
            </>
          ) : <EmptyState compact title="Localização não registrada nesta auditoria." />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-3xl p-2"><DialogTitle className="sr-only">Foto</DialogTitle>{viewer && <img src={viewer} alt="Evidência" className="w-full rounded" />}</DialogContent>
      </Dialog>
      <EditAnswerDialog answer={edit} onClose={() => setEdit(null)} onSaved={() => {
        qc.invalidateQueries({ queryKey: ["audit", id] }); qc.invalidateQueries({ queryKey: ["audit-logs", id] }); qc.invalidateQueries({ queryKey: ["audits"] }); qc.invalidateQueries({ queryKey: ["audit-plans", id] }); qc.invalidateQueries({ queryKey: ["analytics"] }); qc.invalidateQueries({ queryKey: ["action-plans"] });
      }} />
    </>
  );
}

const fmtLog = (v: string | null) => (v ? ANSWERS.find((x) => x.value === v)?.label ?? v : "—");

function EditAnswerDialog({ answer, onClose, onSaved }: { answer: Ans | null; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<AnswerValue>("COMPLIANT");
  const [obs, setObs] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (answer) { setValue((answer.answer as AnswerValue) ?? "COMPLIANT"); setObs(answer.observation ?? ""); setReason(""); } }, [answer]);
  async function save() {
    if (reason.trim().length < 5) return toast.error("Informe o motivo da alteração.");
    if (requiresEvidence(value) && !obs.trim()) return toast.error("NC/NCP exige observação.");
    setBusy(true);
    try {
      await adminUpdateAnswer({ data: { answerId: answer!.id, answer: value, observation: obs, reason } });
    } catch (e) {
      return toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
    toast.success("Resposta alterada e resultado recalculado.");
    onSaved(); onClose();
  }
  return (
    <Dialog open={!!answer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Alterar resposta {answer && String(answer.order_snapshot).padStart(2, "0")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{answer?.question_snapshot}</p>
        <div className="grid gap-4">
          <Field label="Resposta">
            <Select value={value} onValueChange={(v) => setValue(v as AnswerValue)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ANSWERS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Observação"><Textarea value={obs} maxLength={2000} onChange={(e) => setObs(e.target.value)} /></Field>
          <Field label="Motivo da alteração *"><Textarea value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar alteração</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
