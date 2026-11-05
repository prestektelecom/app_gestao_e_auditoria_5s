import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createChangeRequest, createChecklistDraft, deleteChecklistQuestion, discardChecklistDraft, listChangeRequests,
  listChecklistQuestions, listChecklistVersions, publishChecklistVersion, reviewChangeRequest, saveChecklistQuestion,
  swapChecklistQuestions,
} from "@/lib/checklist.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { SENSES, senseFull, senseRank } from "@/lib/checklist";
import { formatDate, formatDateTime } from "@/lib/format";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, Panel, Restricted, StatusBadge } from "@/components/app/kit";
import { Field } from "@/components/app/unit-sector-forms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/checklist")({
  head: () => ({
    meta: [
      { title: "Checklist 5S — Prestek 5S" },
      { name: "description", content: "Checklist 5S versionado, perguntas por senso e propostas do Comitê." },
      { property: "og:title", content: "Checklist 5S — Prestek 5S" },
      { property: "og:description", content: "Checklist 5S versionado, perguntas por senso e propostas do Comitê." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Version = { id: string; version_number: string; status: string; description: string | null; created_at: string; published_at: string | null };
type Question = { id: string; version_id: string; sense: string; position: number; text: string; active: boolean; created_at: string };
type CR = {
  id: string; question_id: string | null; question_text_snapshot: string | null; kind: string; proposal: string; justification: string;
  author_name: string | null; status: string; created_at: string;
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Rascunho", PUBLISHED: "Vigente", ARCHIVED: "Arquivada" };
const CR_LABEL: Record<string, string> = { PENDING: "Pendente", APPROVED: "Aprovada", REJECTED: "Rejeitada", INCORPORATED: "Incorporada" };

const versionsQ = { queryKey: ["checklist-versions"], queryFn: async () => (await listChecklistVersions()) as Version[] };
const errMsg = (e: unknown) => (e as Error).message || "Não foi possível concluir.";

function Page() {
  const { role } = useAuth();
  const versions = useQuery(versionsQ);
  if (!can(role, "checklist.view")) return <Restricted />;
  return (
    <>
      <PageHeader title="Checklist 5S" subtitle="Versões e perguntas" />
      <Tabs defaultValue="questions">
        <TabsList>
          <TabsTrigger value="questions">Perguntas</TabsTrigger>
          <TabsTrigger value="proposals">Propostas do Comitê</TabsTrigger>
        </TabsList>
        <TabsContent value="questions" className="mt-4">
          {versions.isLoading ? <Panel><LoadingBlock /></Panel> : <VersionsView versions={versions.data ?? []} />}
        </TabsContent>
        <TabsContent value="proposals" className="mt-4"><ProposalsView /></TabsContent>
      </Tabs>
    </>
  );
}

function VersionsView({ versions }: { versions: Version[] }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const manage = can(role, "checklist.manage");
  const published = versions.find((v) => v.status === "PUBLISHED");
  const draft = versions.find((v) => v.status === "DRAFT");
  const [selected, setSelected] = useState<string>("");
  useEffect(() => { if (!selected && versions.length) setSelected((draft ?? published ?? versions[0])!.id); }, [versions, selected, draft, published]);
  const version = versions.find((v) => v.id === selected);
  const [newDlg, setNewDlg] = useState(false);
  const [desc, setDesc] = useState("");

  const questions = useQuery({
    queryKey: ["checklist-questions", selected],
    enabled: !!selected,
    queryFn: async () => {
      const data = (await listChecklistQuestions({ data: { versionId: selected } })) as Question[];
      return data.sort((a, b) => senseRank(a.sense) - senseRank(b.sense) || a.position - b.position);
    },
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["checklist-versions"] }), qc.invalidateQueries({ queryKey: ["checklist-questions"] })]);

  async function createDraft() {
    let data: string;
    try { data = await createChecklistDraft({ data: { description: desc } }); } catch (e) { return toast.error(errMsg(e)); }
    toast.success("Rascunho criado a partir da versão vigente.");
    setNewDlg(false); setDesc("");
    await refresh(); setSelected(data as string);
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-72">
            <Field label="Versão">
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{versions.map((v) => <SelectItem key={v.id} value={v.id}>{v.version_number} — {STATUS_LABEL[v.status]}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          {version && (
            <div className="flex-1 text-sm text-muted-foreground">
              {version.description && <p>{version.description}</p>}
              <p>Criada em {formatDate(version.created_at)}{version.published_at && ` · Publicada em ${formatDateTime(version.published_at)}`}</p>
            </div>
          )}
          {manage && !draft && <Button onClick={() => setNewDlg(true)}><Plus className="size-4" /> Criar nova versão</Button>}
        </div>
      </Panel>

      {version?.status === "DRAFT" && manage && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-tape/60 bg-tape/10 p-3 text-sm">
          <span className="flex-1">Rascunho {version.version_number}: edite as perguntas e publique quando estiver pronto. A versão vigente continua valendo até a publicação.</span>
          <ConfirmAction title="Descartar rascunho?" description="Todas as alterações deste rascunho serão perdidas." confirmLabel="Descartar" destructive
            onConfirm={async () => { try { await discardChecklistDraft({ data: { versionId: version.id } }); } catch (e) { return void toast.error(errMsg(e)); } toast.success("Rascunho descartado."); setSelected(""); await refresh(); }}
            trigger={(o) => <Button variant="outline" size="sm" onClick={o}>Descartar</Button>} />
          <ConfirmAction title={`Publicar versão ${version.version_number}?`}
            description={`A versão ${published?.version_number ?? "atual"} será arquivada. Novas auditorias usarão a versão ${version.version_number}; auditorias anteriores permanecem com a versão utilizada.`}
            confirmLabel="Publicar nova versão"
            onConfirm={async () => { try { await publishChecklistVersion({ data: { versionId: version.id } }); } catch (e) { return void toast.error(errMsg(e)); } toast.success("Nova versão publicada."); await refresh(); }}
            trigger={(o) => <Button size="sm" onClick={o}>PUBLICAR NOVA VERSÃO</Button>} />
        </div>
      )}

      {questions.isLoading ? <Panel><LoadingBlock /></Panel> : version && (
        <QuestionsList version={version} questions={questions.data ?? []} editable={manage && version.status === "DRAFT"} onChange={refresh} />
      )}

      <Dialog open={newDlg} onOpenChange={setNewDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar nova versão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">As perguntas da versão vigente ({published?.version_number ?? "—"}) serão copiadas para um novo rascunho.</p>
          <Field label="Descrição (opcional)"><Input value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} /></Field>
          <DialogFooter><Button variant="outline" onClick={() => setNewDlg(false)}>Cancelar</Button><Button onClick={createDraft}>Criar rascunho</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionsList({ version, questions, editable, onChange }: { version: Version; questions: Question[]; editable: boolean; onChange: () => Promise<unknown> }) {
  const { role } = useAuth();
  const [edit, setEdit] = useState<{ open: boolean; q?: Question | null; sense?: string }>({ open: false });
  const [propose, setPropose] = useState<{ open: boolean; q?: Question | null }>({ open: false });
  const canPropose = can(role, "checklist.propose") && version.status === "PUBLISHED";
  let n = 0;

  async function move(q: Question, dir: -1 | 1) {
    const same = questions.filter((x) => x.sense === q.sense);
    const i = same.findIndex((x) => x.id === q.id);
    const other = same[i + dir];
    if (!other) return;
    try {
      await swapChecklistQuestions({ data: { a: { id: q.id, position: q.position }, b: { id: other.id, position: other.position } } });
    } catch (e) { toast.error(errMsg(e)); }
    await onChange();
  }

  return (
    <>
      {canPropose && (
        <div className="flex justify-end"><Button variant="outline" onClick={() => setPropose({ open: true, q: null })}><Plus className="size-4" /> Propor nova pergunta</Button></div>
      )}
      {SENSES.map((s, si) => {
        const list = questions.filter((q) => q.sense === s.code);
        return (
          <Panel key={s.code} label={String(si + 1)} title={senseFull(s.code)}
            aside={editable && <Button size="sm" variant="outline" onClick={() => setEdit({ open: true, q: null, sense: s.code })}><Plus className="size-4" /> Pergunta</Button>}>
            {list.length === 0 ? <EmptyState compact title="Nenhuma pergunta neste senso." /> : (
              <ol className="divide-y divide-border">
                {list.map((q, i) => {
                  if (q.active) n++;
                  return (
                    <li key={q.id} className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-start", !q.active && "opacity-60")}>
                      <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{q.active ? String(n).padStart(2, "0") : "—"}</span>
                      <p className="flex-1 text-sm">{q.text}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {!q.active && <StatusBadge active={false} on="Ativa" off="Inativa" />}
                        {editable && (
                          <>
                            <Button size="icon" variant="ghost" className="size-8" disabled={i === 0} onClick={() => move(q, -1)} aria-label="Subir"><ArrowUp className="size-4" /></Button>
                            <Button size="icon" variant="ghost" className="size-8" disabled={i === list.length - 1} onClick={() => move(q, 1)} aria-label="Descer"><ArrowDown className="size-4" /></Button>
                            <Button size="icon" variant="ghost" className="size-8" onClick={() => setEdit({ open: true, q })} aria-label="Editar"><Pencil className="size-4" /></Button>
                            <ConfirmAction title="Excluir pergunta do rascunho?" description="A pergunta será removida apenas deste rascunho." confirmLabel="Excluir" destructive
                              onConfirm={async () => { try { await deleteChecklistQuestion({ data: { id: q.id } }); } catch (e) { toast.error(errMsg(e)); } await onChange(); }}
                              trigger={(o) => <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={o} aria-label="Excluir"><Trash2 className="size-4" /></Button>} />
                          </>
                        )}
                        {canPropose && <Button size="sm" variant="ghost" onClick={() => setPropose({ open: true, q })}>Propor alteração</Button>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        );
      })}
      <QuestionDialog state={edit} version={version} questions={questions} onClose={() => setEdit({ open: false })} onSaved={onChange} />
      <ProposalDialog state={propose} onClose={() => setPropose({ open: false })} />
    </>
  );
}

function QuestionDialog({ state, version, questions, onClose, onSaved }: {
  state: { open: boolean; q?: Question | null; sense?: string }; version: Version; questions: Question[]; onClose: () => void; onSaved: () => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const [sense, setSense] = useState("UTILIZACAO");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (state.open) { setText(state.q?.text ?? ""); setSense(state.q?.sense ?? state.sense ?? "UTILIZACAO"); setActive(state.q?.active ?? true); }
  }, [state]);

  async function save() {
    if (text.trim().length < 5) return toast.error("Informe o texto da pergunta.");
    setBusy(true);
    const maxPos = Math.max(0, ...questions.filter((q) => q.sense === sense).map((q) => q.position));
    try {
      await saveChecklistQuestion({ data: {
        ...(state.q ? { id: state.q.id } : {}), versionId: version.id, text: text.trim(), sense: sense as "UTILIZACAO", active,
        ...(!state.q || sense !== state.q.sense ? { position: maxPos + 1 } : {}),
      } });
    } catch (e) { return toast.error(errMsg(e)); } finally { setBusy(false); }
    toast.success("Pergunta salva.");
    await onSaved(); onClose();
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{state.q ? "Editar pergunta" : "Nova pergunta"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Senso">
            <Select value={sense} onValueChange={setSense}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SENSES.map((s) => <SelectItem key={s.code} value={s.code}>{senseFull(s.code)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Texto da pergunta"><Textarea rows={4} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Pergunta ativa</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalDialog({ state, onClose }: { state: { open: boolean; q?: Question | null }; onClose: () => void }) {
  const qc = useQueryClient();
  const [proposal, setProposal] = useState("");
  const [just, setJust] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (state.open) { setProposal(state.q?.text ?? ""); setJust(""); } }, [state]);
  async function save() {
    if (proposal.trim().length < 5 || just.trim().length < 5) return toast.error("Preencha a proposta e a justificativa.");
    setBusy(true);
    try {
      await createChangeRequest({ data: {
        questionId: state.q?.id ?? null, questionText: state.q?.text ?? null, proposal: proposal.trim(), justification: just.trim(),
      } });
    } catch (e) { return toast.error(errMsg(e)); } finally { setBusy(false); }
    toast.success("Proposta enviada ao Administrador.");
    qc.invalidateQueries({ queryKey: ["change-requests"] });
    onClose();
  }
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{state.q ? "Propor alteração" : "Propor nova pergunta"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          {state.q && <p className="empty-well p-3 text-sm">{state.q.text}</p>}
          <Field label={state.q ? "Novo texto sugerido" : "Pergunta sugerida"}><Textarea rows={4} value={proposal} maxLength={2000} onChange={(e) => setProposal(e.target.value)} /></Field>
          <Field label="Justificativa"><Textarea rows={3} value={just} maxLength={2000} onChange={(e) => setJust(e.target.value)} /></Field>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={busy}>Enviar proposta</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalsView() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const manage = can(role, "checklist.manage");
  const list = useQuery({
    queryKey: ["change-requests"],
    queryFn: async () => {
      return (await listChangeRequests()) as CR[];
    },
  });
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => (list.data ?? []).filter((r) => filter === "all" || r.status === filter), [list.data, filter]);

  async function setStatus(id: string, status: string) {
    try { await reviewChangeRequest({ data: { id, status: status as "APPROVED" } }); } catch (e) { return toast.error(errMsg(e)); }
    toast.success(`Proposta marcada como ${CR_LABEL[status]}.`);
    qc.invalidateQueries({ queryKey: ["change-requests"] });
  }

  if (list.isLoading) return <Panel><LoadingBlock /></Panel>;
  return (
    <div className="flex flex-col gap-4">
      <div className="w-full sm:w-52">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os status</SelectItem>{Object.entries(CR_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {rows.length === 0 ? <Panel><EmptyState title="Nenhuma proposta." description={manage ? "As sugestões do Comitê 5S aparecerão aqui." : "Use “Propor alteração” na aba Perguntas."} /></Panel> : rows.map((r) => (
        <Panel key={r.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{r.kind === "NEW" ? "Nova pergunta" : "Alteração"}</span>
            <span className="text-xs text-muted-foreground">{r.author_name ?? "—"} · {formatDateTime(r.created_at)}</span>
            <span className="ml-auto text-xs font-medium">{CR_LABEL[r.status]}</span>
          </div>
          {r.question_text_snapshot && <p className="mt-3 text-sm text-muted-foreground line-through decoration-muted-foreground/40">{r.question_text_snapshot}</p>}
          <p className="mt-2 text-sm font-medium">{r.proposal}</p>
          <p className="mt-2 text-sm text-muted-foreground"><span className="eyebrow mr-2">Justificativa</span>{r.justification}</p>
          {manage && (
            <div className="mt-3 flex flex-wrap gap-2">
              {r.status !== "APPROVED" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "APPROVED")}>Aprovar</Button>}
              {r.status !== "REJECTED" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "REJECTED")}>Rejeitar</Button>}
              {r.status !== "INCORPORATED" && <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "INCORPORATED")}>Marcar como incorporada</Button>}
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}
