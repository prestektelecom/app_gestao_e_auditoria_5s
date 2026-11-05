import { useEffect, useRef, useState, type ComponentProps } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileDown, Loader2, Plus, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveMeeting } from "@/lib/meetings.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { friendlyError } from "@/lib/format";
import { unitsQuery } from "@/lib/queries";
import {
  ACTION_STATUS, emptyAction, MEETING_STATUS, MEETING_TOPICS, MEETING_TYPES, meetingQuery, PARTICIPANT_ROLES, peopleQuery,
  personKey, type Meeting, type MeetingAction, type Participant,
} from "@/lib/meetings";
import { downloadAtaPdf } from "@/lib/ata-pdf";
import { LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { PersonSelect } from "@/components/app/person-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const T = "Ata de Reunião - Comitê 5S";
const D = "Registro da reunião do Comitê 5S com participantes, pauta, deliberações e plano de ação.";
export const Route = createFileRoute("/_authenticated/reunioes/atas_/$id")({
  head: () => ({ meta: [
    { title: T }, { name: "description", content: D }, { property: "og:title", content: T },
    { property: "og:description", content: D }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

type Form = Omit<Meeting, "id" | "meeting_number" | "created_at" | "updated_at">;
const today = () => new Date().toLocaleDateString("sv-SE");
const blank = (): Form => ({
  title: "Reunião do Comitê 5S", meeting_type: "ORDINARIA", topics: [], meeting_date: today(), start_time: null, end_time: null,
  location: null, unit_id: null, facilitator_name: null, secretary_name: null, objective: null, agenda: null, discussion: null,
  previous_followup: null, notes: null, next_meeting_date: null, status: "RASCUNHO",
});
const nn = (v: string) => (v.trim() === "" ? null : v);

const ataDate = (v?: string | null) => {
  const d = v ? new Date(`${v}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};
const dateLabel = (v?: string | null) => ataDate(v)?.toLocaleDateString("pt-BR") ?? "—";
const ataTitle = (v?: string | null) => {
  const d = ataDate(v);
  const stamp = d
    ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")
    : "";
  return `Ata de Reunião - Comitê 5S${stamp ? ` - ${stamp}` : ""}`;
};

function Page() {
  const { id } = Route.useParams();
  const isNew = id === "nova";
  const { role } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const manage = can(role, "meetings.manage");
  const { data, isLoading } = useQuery({ ...meetingQuery(id), enabled: !isNew });
  const { data: people = [] } = useQuery(peopleQuery);
  const { data: units = [] } = useQuery(unitsQuery);
  const [form, setForm] = useState<Form>(blank());
  const [parts, setParts] = useState<Participant[]>([]);
  const [actions, setActions] = useState<MeetingAction[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [number, setNumber] = useState("");

  // The browser uses the page title as the suggested name of the saved PDF, so keep it as "Ata de Reunião - Comitê 5S - <data>".
  const prevTitle = useRef<string | null>(null);
  useEffect(() => {
    if (prevTitle.current === null) prevTitle.current = document.title;
    document.title = ataTitle(form.meeting_date);
  }, [form.meeting_date]);
  useEffect(() => () => {
    if (prevTitle.current !== null) document.title = prevTitle.current;
  }, []);

  // Load the saved ata once per id (and again after saving) — background refetches must not wipe what the user is typing.
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!data?.meeting) return;
    const stamp = `${data.meeting.id}:${data.meeting.updated_at}`;
    if (stamp === loadedAt) return;
    const { id: _i, meeting_number, created_at: _c, updated_at: _u, ...rest } = data.meeting;
    setForm(rest); setNumber(meeting_number); setParts(data.participants); setActions(data.actions); setRemoved([]);
    setLoadedAt(stamp);
  }, [data, loadedAt]);

  if (!can(role, "meetings.view")) return <Restricted />;
  if (!isNew && isLoading) return <LoadingBlock />;
  if (!isNew && !data?.meeting) return <Panel><p className="text-sm">Ata não encontrada.</p></Panel>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ro = !manage;
  const presentNames = parts.filter((p) => p.present).map((p) => p.name);

  async function save() {
    if (!form.title.trim()) return toast.error("Informe o título da reunião.");
    if (!form.meeting_date) return toast.error("Informe a data da reunião.");
    if (form.status === "FINALIZADA" && parts.length === 0) return toast.error("Inclua ao menos um participante antes de finalizar.");
    const bad = actions.find((a) => !a.what.trim());
    if (bad) return toast.error("Toda deliberação precisa descrever o que será feito.");
    setBusy(true);
    try {
      // Reunião, participantes (lista substituída) e deliberações (plano de ação) numa só transação.
      const { id: mid } = await saveMeeting({ data: {
        ...(isNew ? {} : { id }), meeting: form, participants: parts, actions, removedActionIds: removed,
      } });
      toast.success(isNew ? "Ata criada e plano de ação gerado" : "Ata salva");
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["meeting-actions"] });
      qc.invalidateQueries({ queryKey: ["meeting", mid] });
      if (isNew) navigate({ to: "/reunioes/atas/$id", params: { id: mid } });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally { setBusy(false); }
  }

  const printAta = () => {
    document.title = ataTitle(form.meeting_date);
    window.print();
  };

  // Gera o PDF direto no computador, com o nome do arquivo definido por nós.
  async function savePdf() {
    setPdfBusy(true);
    try {
      const name = await downloadAtaPdf({
        meeting: form,
        number,
        unitName: units.find((u) => u.id === form.unit_id)?.name ?? null,
        participants: parts,
        actions,
      });
      toast.success(`PDF salvo como ${name}`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally { setPdfBusy(false); }
  }


  const upd = (i: number, patch: Partial<MeetingAction>) => setActions((l) => l.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const updP = (i: number, patch: Partial<Participant>) => setParts((l) => l.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={isNew ? "Nova ata de reunião" : `Ata ${number}`}
          subtitle="Reuniões · Comitê 5S"
          actions={<>
            <Button variant="outline" asChild><Link to="/reunioes/atas"><ArrowLeft className="size-4" /> Voltar</Link></Button>
            {!isNew && <Button variant="outline" onClick={printAta}><Printer className="size-4" /> Imprimir</Button>}
            {!isNew && <Button variant="outline" onClick={savePdf} disabled={pdfBusy}>{pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Baixar PDF</Button>}
            {manage && <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar ata</Button>}
          </>}
        />
      </div>

      <div className="mb-4 hidden border-b border-border pb-3 print:block print-avoid">
        <h1 className="text-lg font-bold">Ata de Reunião — Comitê 5S</h1>
        <p className="mt-0.5 text-xs">
          {dateLabel(form.meeting_date)}
          {number ? ` · ${number}` : ""}
        </p>
      </div>
      <Panel label="1" title="Identificação">
        <div className="grid gap-4 md:grid-cols-4">
          <F label="Título *" className="md:col-span-2"><Input disabled={ro} value={form.title} onChange={(e) => set("title", e.target.value)} /></F>
          <F label="Tipo">
            <Select disabled={ro} value={form.meeting_type} onValueChange={(v) => set("meeting_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MEETING_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Situação">
            <Select disabled={ro} value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MEETING_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Data *"><Input type="date" disabled={ro} value={form.meeting_date} onChange={(e) => set("meeting_date", e.target.value)} /></F>
          <F label="Início"><Input type="time" disabled={ro} value={form.start_time?.slice(0, 5) ?? ""} onChange={(e) => set("start_time", nn(e.target.value))} /></F>
          <F label="Término"><Input type="time" disabled={ro} value={form.end_time?.slice(0, 5) ?? ""} onChange={(e) => set("end_time", nn(e.target.value))} /></F>
          <F label="Unidade">
            <Select disabled={ro} value={form.unit_id ?? "none"} onValueChange={(v) => set("unit_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todas / geral</SelectItem>
                {units.filter((u) => u.active).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Local / formato" className="md:col-span-2"><Input disabled={ro} placeholder="Ex.: Sala de reuniões, Teams" value={form.location ?? ""} onChange={(e) => set("location", nn(e.target.value))} /></F>
          <F label="Coordenador da reunião">
            <PersonSelect disabled={ro} people={people} value={people.find((p) => p.name === form.facilitator_name) ? personKey(people.find((p) => p.name === form.facilitator_name)!.kind, people.find((p) => p.name === form.facilitator_name)!.id) : ""}
              onChange={(p) => set("facilitator_name", p?.name ?? null)} />
          </F>
          <F label="Secretário (redator da ata)">
            <PersonSelect disabled={ro} people={people} value={people.find((p) => p.name === form.secretary_name) ? personKey(people.find((p) => p.name === form.secretary_name)!.kind, people.find((p) => p.name === form.secretary_name)!.id) : ""}
              onChange={(p) => set("secretary_name", p?.name ?? null)} />
          </F>
        </div>
        <div className="mt-5">
          <Label className="text-xs text-muted-foreground">Assuntos tratados</Label>
          <div className="mt-2 flex flex-wrap gap-3">
            {MEETING_TOPICS.map((t) => (
              <label key={t} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                <Checkbox disabled={ro} checked={form.topics.includes(t)}
                  onCheckedChange={(c) => set("topics", c ? [...form.topics, t] : form.topics.filter((x) => x !== t))} />
                {t}
              </label>
            ))}
          </div>
        </div>
      </Panel>

      <Panel label="2" title="Participantes" aside={<span className="text-xs text-muted-foreground">{presentNames.length} presente(s) de {parts.length}</span>}>
        {manage && (
          <div className="mb-4 max-w-md">
            <PersonSelect people={people.filter((p) => !parts.some((x) => x.person_kind === p.kind && x.person_id === p.id))} value="" placeholder="Adicionar participante…"
              onChange={(p) => p && setParts((l) => [...l, { person_kind: p.kind, person_id: p.id, name: p.name, role_in_meeting: "Membro do Comitê", present: true }])} />
          </div>
        )}
        {parts.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum participante incluído.</p> : (
          <div className="grid gap-2">
            {parts.map((p, i) => (
              <div key={`${p.person_kind}${p.person_id}`} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
                <span className="min-w-[180px] flex-1 text-sm font-medium">{p.name}<span className="ml-2 text-xs text-muted-foreground">{p.person_kind === "auditor" ? "Auditor" : "Usuário"}</span></span>
                <div className="w-48">
                  <Select disabled={ro} value={p.role_in_meeting ?? "Membro do Comitê"} onValueChange={(v) => updP(i, { role_in_meeting: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{PARTICIPANT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm"><Checkbox disabled={ro} checked={p.present} onCheckedChange={(c) => updP(i, { present: !!c })} /> Presente</label>
                {manage && <Button size="icon" variant="ghost" onClick={() => setParts((l) => l.filter((_, j) => j !== i))} title="Remover"><Trash2 className="size-4 text-destructive" /></Button>}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel label="3" title="Pauta e registro">
        <div className="grid gap-4 md:grid-cols-2">
          <F label="Objetivo da reunião"><PTextarea disabled={ro} rows={3} value={form.objective ?? ""} onChange={(e) => set("objective", nn(e.target.value))} /></F>
          <F label="Pauta (itens a tratar)"><PTextarea disabled={ro} rows={3} placeholder="1. Resultados das auditorias do mês&#10;2. Revisão do checklist&#10;3. Status dos planos de ação" value={form.agenda ?? ""} onChange={(e) => set("agenda", nn(e.target.value))} /></F>
          <F label="Acompanhamento da reunião anterior"><PTextarea disabled={ro} rows={3} value={form.previous_followup ?? ""} onChange={(e) => set("previous_followup", nn(e.target.value))} /></F>
          <F label="Discussões e principais pontos"><PTextarea disabled={ro} rows={3} value={form.discussion ?? ""} onChange={(e) => set("discussion", nn(e.target.value))} /></F>
        </div>
      </Panel>

      <Panel label="4" title="Deliberações e encaminhamentos" aside={<span className="text-xs text-muted-foreground">Cada item vira uma ação no Plano de Ação das reuniões</span>}>
        <div className="grid gap-3">
          {actions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma deliberação registrada.</p>}
          {actions.map((a, i) => (
            <div key={a.id ?? `n${i}`} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-6">
              <F label="O quê? *" className="md:col-span-3"><PInput disabled={ro} value={a.what} onChange={(e) => upd(i, { what: e.target.value })} /></F>
              <F label="Assunto">
                <Select disabled={ro} value={a.topic ?? "none"} onValueChange={(v) => upd(i, { topic: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{MEETING_TOPICS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Quem?">
                <PersonSelect disabled={ro} people={people} value={personKey(a.who_kind, a.who_id)}
                  onChange={(p) => upd(i, { who_kind: p?.kind ?? null, who_id: p?.id ?? null, who_name: p?.name ?? null })} />
              </F>
              <F label="Quando?"><Input type="date" disabled={ro} value={a.when_date ?? ""} onChange={(e) => upd(i, { when_date: nn(e.target.value) })} /></F>
              <F label="Por quê?" className="md:col-span-3"><PInput disabled={ro} value={a.why ?? ""} onChange={(e) => upd(i, { why: nn(e.target.value) })} /></F>
              <F label="Como?" className="md:col-span-2"><PInput disabled={ro} value={a.how ?? ""} onChange={(e) => upd(i, { how: nn(e.target.value) })} /></F>
              <div className="flex items-end justify-end">
                {manage && <Button variant="ghost" onClick={() => { if (a.id) setRemoved((r) => [...r, a.id!]); setActions((l) => l.filter((_, j) => j !== i)); }}><Trash2 className="size-4 text-destructive" /> Remover</Button>}
              </div>
              {a.id && <p className="text-xs text-muted-foreground md:col-span-6">Situação no plano: {ACTION_STATUS[a.status] ?? a.status}</p>}
            </div>
          ))}
          {manage && <Button variant="outline" className="w-fit" onClick={() => setActions((l) => [...l, emptyAction()])}><Plus className="size-4" /> Adicionar deliberação</Button>}
        </div>
      </Panel>

      <Panel label="5" title="Encerramento">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <F label="Observações gerais"><PTextarea disabled={ro} rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", nn(e.target.value))} /></F>
          <F label="Próxima reunião"><Input type="date" disabled={ro} value={form.next_meeting_date ?? ""} onChange={(e) => set("next_meeting_date", nn(e.target.value))} /></F>
        </div>
        {presentNames.length > 0 && (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {presentNames.map((n) => (
              <div key={n} className="pt-8 text-center text-xs"><div className="border-t border-foreground/40 pt-1">{n}</div></div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

function PrintText({ value }: { value: unknown }) {
  return <div className="hidden whitespace-pre-wrap break-words rounded-md border border-border px-3 py-2 text-sm print:block">{String(value ?? "") || "—"}</div>;
}
function PTextarea(props: ComponentProps<typeof Textarea>) {
  return <><Textarea {...props} className={`print:hidden ${props.className ?? ""}`} /><PrintText value={props.value} /></>;
}
function PInput(props: ComponentProps<typeof Input>) {
  return <><Input {...props} className={`print:hidden ${props.className ?? ""}`} /><PrintText value={props.value} /></>;
}
