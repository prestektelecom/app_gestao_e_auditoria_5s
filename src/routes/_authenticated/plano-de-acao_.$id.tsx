import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getActionPlan, updateActionPlan } from "@/lib/audits.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PLAN_STATUS, type ActionPlan } from "@/lib/analytics";
import { answerLabel, senseLabel } from "@/lib/checklist";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { settingsQuery } from "@/lib/queries";
import { EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { DeadlineBadge } from "@/components/app/analytics-ui";
import { Field } from "@/components/app/unit-sector-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/plano-de-acao_/$id")({
  head: () => ({
    meta: [
      { title: "Ação 5W2H — Prestek 5S" },
      { name: "description", content: "Origem da Não Conformidade e preenchimento do 5W2H." },
      { property: "og:title", content: "Ação 5W2H — Prestek 5S" },
      { property: "og:description", content: "Origem da Não Conformidade e preenchimento do 5W2H." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const LOG_FIELD: Record<string, string> = { what: "O quê", why: "Por quê", where: "Onde", who: "Quem", when: "Quando", how: "Como", how_much: "Quanto", status: "Status", created: "Criação", origin_changed: "Origem alterada" };

function Page() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const qc = useQueryClient();
  const settings = useQuery(settingsQuery);
  const q = useQuery({
    queryKey: ["action-plan", id],
    queryFn: async () => {
      const r = await getActionPlan({ data: { id } });
      if (!r) return null;
      const p = r.plan as Record<string, unknown>;
      return { plan: { ...p, how_much: p.how_much === null ? null : Number(p.how_much) } as unknown as ActionPlan, answer: r.answer, photos: r.photos, logs: r.logs };
    },
  });
  const [form, setForm] = useState({ what: "", why: "", where: "", who: "", when: "", how: "", how_much: "", status: "PENDENTE" });
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  useEffect(() => {
    const p = q.data?.plan;
    if (p) setForm({ what: p.what ?? "", why: p.why ?? "", where: p.where_text ?? `${p.unit_name} / ${p.sector_name}`, who: p.who ?? "", when: p.when_date ?? "",
      how: p.how ?? "", how_much: p.how_much === null ? "" : p.how_much.toFixed(2).replace(".", ","), status: p.status });
  }, [q.data?.plan]);

  if (!can(role, "actionPlans.view")) return <Restricted />;
  if (q.isLoading) return <Panel><LoadingBlock /></Panel>;
  if (!q.data) return <Panel><EmptyState title="Ação não encontrada." action={<Button asChild variant="outline"><Link to="/plano-de-acao" search={{}}>Voltar</Link></Button>} /></Panel>;
  const { plan: p, answer, photos, logs } = q.data;
  const editable = can(role, "actionPlans.edit");
  const isAdmin = role === "admin";

  async function save() {
    const raw = form.how_much.trim().replace(/[R$\s.]/g, "").replace(",", ".");
    const money = raw === "" ? null : Number(raw);
    if (money !== null && (!Number.isFinite(money) || money < 0)) return toast.error("Valor inválido. Use o formato 0,00.");
    setBusy(true);
    try {
      await updateActionPlan({ data: {
        id, what: form.what, why: form.why, where: form.where, who: form.who, when: form.when || null, how: form.how, howMuch: money,
        status: form.status as "PENDENTE",
      } });
    } catch (e) {
      return toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
    toast.success("Plano de Ação salvo.");
    qc.invalidateQueries({ queryKey: ["action-plan", id] }); qc.invalidateQueries({ queryKey: ["action-plans"] }); qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  const txt = (k: "what" | "why" | "who" | "how", label: string, hint: string) => (
    <Field label={label}><Textarea disabled={!editable} value={form[k]} maxLength={2000} placeholder={hint} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
  );

  return (
    <>
      <Link to="/plano-de-acao" search={{}} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Plano de Ação</Link>
      <PageHeader title={`${p.nc_type} · ${p.sector_name}`} subtitle="Ação 5W2H" actions={<DeadlineBadge plan={p} alertDays={settings.data?.deadline_alert_days ?? 3} />} />
      {p.origin_changed && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><b>Origem alterada administrativamente.</b><p className="text-muted-foreground">{p.origin_note}</p></div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel label="a" title="Origem" tape>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="eyebrow">Auditoria</dt><dd className="mt-1"><Link to="/auditorias/$id" params={{ id: p.audit_id }} className="font-mono text-primary hover:underline">{p.audits?.audit_number}</Link></dd></div>
            <div><dt className="eyebrow">Data da auditoria</dt><dd className="mt-1">{formatDateTime(p.audits?.finished_at)}</dd></div>
            <div><dt className="eyebrow">Unidade</dt><dd className="mt-1">{p.unit_name}</dd></div>
            <div><dt className="eyebrow">Setor</dt><dd className="mt-1">{p.sector_name}</dd></div>
            <div><dt className="eyebrow">Senso</dt><dd className="mt-1">{senseLabel(p.sense)}</dd></div>
            <div><dt className="eyebrow">Auditor responsável</dt><dd className="mt-1">{p.audits?.auditor_name_snapshot}</dd></div>
            <div className="sm:col-span-2"><dt className="eyebrow">Pergunta {answer?.order_snapshot ?? ""}</dt><dd className="mt-1">{p.question}</dd></div>
            <div className="sm:col-span-2"><dt className="eyebrow">Resultado</dt><dd className="mt-1 font-semibold text-destructive">{p.nc_type === "NC" ? "Não Conforme" : "Não Conforme Parcial"}
              {p.origin_changed && answer && <span className="ml-2 font-normal text-muted-foreground">(atual: {answerLabel(answer.answer)})</span>}</dd></div>
            <div className="sm:col-span-2"><dt className="eyebrow">Observação do auditor</dt><dd className="mt-1 text-muted-foreground">{p.occurrence || "—"}</dd></div>
          </dl>
          {photos.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{photos.map((u) => <button key={u} type="button" aria-label="Ampliar foto" onClick={() => setViewer(u)} className="rounded-lg"><img src={u} alt="Evidência" loading="lazy" className="size-20 rounded-lg border border-border object-cover" /></button>)}</div>}
        </Panel>

        <Panel label="b" title="5W2H" aside={!editable && <span className="text-xs text-muted-foreground">Somente consulta</span>}>
          <div className="grid gap-4">
            {txt("what", "WHAT — O que será feito?", "Descreva a ação")}
            {txt("why", "WHY — Por que será feito?", "Justificativa")}
            <Field label="WHERE — Onde?"><Input disabled={!editable || !isAdmin} value={form.where} maxLength={300} onChange={(e) => setForm({ ...form, where: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WHEN — Prazo"><Input type="date" disabled={!editable} value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} /></Field>
              <Field label="WHO — Responsável"><Input disabled={!editable} value={form.who} maxLength={200} placeholder="Nome do responsável" onChange={(e) => setForm({ ...form, who: e.target.value })} /></Field>
            </div>
            {txt("how", "HOW — Como será feito?", "Etapas da execução")}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="HOW MUCH — Custo (opcional)"><Input inputMode="decimal" disabled={!editable} value={form.how_much} placeholder="R$ 0,00" onChange={(e) => setForm({ ...form, how_much: e.target.value })} /></Field>
              <Field label="Status">
                <Select disabled={!editable} value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PLAN_STATUS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Criada em {formatDateTime(p.created_at)} · Atualizada em {formatDateTime(p.updated_at)}{p.completed_at ? ` · Concluída em ${formatDateTime(p.completed_at)}` : ""}
              {p.how_much !== null ? ` · Custo atual ${formatCurrency(p.how_much)}` : ""}</p>
            {editable && <Button className="w-full sm:w-fit" onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar 5W2H</Button>}
          </div>
        </Panel>
      </div>
      {logs.length > 0 && (
        <Panel label="c" title="Histórico da ação">
          <ul className="grid gap-2 text-sm">{logs.map((l) => (
            <li key={l.id} className="empty-well p-3">
              <p className="text-xs text-muted-foreground">{formatDateTime(l.changed_at)} · {l.changed_by_name ?? "—"} · {LOG_FIELD[l.field] ?? l.field}</p>
              <p className="mt-1">{(l.field === "status" ? PLAN_STATUS[l.previous_value ?? ""] : l.previous_value) || "—"} → <b>{(l.field === "status" ? PLAN_STATUS[l.new_value ?? ""] : l.new_value) || "—"}</b></p>
              {l.reason !== "Atualização do 5W2H" && <p className="mt-1 text-muted-foreground">Motivo: {l.reason}</p>}
            </li>))}
          </ul>
        </Panel>
      )}
      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-3xl p-2"><DialogTitle className="sr-only">Foto</DialogTitle>{viewer && <img src={viewer} alt="Evidência" className="w-full rounded" />}</DialogContent>
      </Dialog>
    </>
  );
}
