import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteMeetingAction, saveMeetingAction } from "@/lib/meetings.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDate, friendlyError } from "@/lib/format";
import { ACTION_STATUS, emptyAction, MEETING_TOPICS, meetingActionsQuery, meetingsQuery, peopleQuery, personKey, type MeetingAction } from "@/lib/meetings";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { PersonSelect } from "@/components/app/person-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const T = "Plano de Ação das Reuniões — Prestek 5S";
const D = "Ações 5W2H geradas a partir das deliberações das atas do Comitê 5S.";
export const Route = createFileRoute("/_authenticated/reunioes/plano-de-acao")({
  head: () => ({ meta: [
    { title: T }, { name: "description", content: D }, { property: "og:title", content: T },
    { property: "og:description", content: D }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

type Edit = MeetingAction & { meeting_id: string };
const nn = (v: string) => (v.trim() === "" ? null : v);
const todayStr = () => new Date().toLocaleDateString("sv-SE");

function Page() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(meetingActionsQuery);
  const { data: meetings = [] } = useQuery(meetingsQuery);
  const { data: people = [] } = useQuery(peopleQuery);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (data ?? []).filter((a) =>
    (status === "all" || a.status === status) &&
    `${a.what} ${a.who_name ?? ""} ${a.meetings?.meeting_number ?? ""}`.toLowerCase().includes(q.toLowerCase())), [data, q, status]);

  if (!can(role, "meetings.view")) return <Restricted />;
  const manage = can(role, "meetings.manage");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["meeting-actions"] }); qc.invalidateQueries({ queryKey: ["meetings"] }); qc.invalidateQueries({ queryKey: ["meeting"] }); };

  async function save() {
    if (!edit) return;
    if (!edit.meeting_id) return toast.error("Selecione a ata de origem.");
    if (!edit.what.trim()) return toast.error("Descreva o que será feito.");
    setBusy(true);
    const e = edit;
    const row = {
      meeting_id: e.meeting_id, topic: e.topic, what: e.what, why: e.why, where_text: e.where_text, who_name: e.who_name,
      who_kind: e.who_kind, who_id: e.who_id, when_date: e.when_date, how: e.how, how_much: e.how_much, status: e.status,
    };
    const id = e.id;
    try {
      await saveMeetingAction({ data: { ...row, ...(id ? { id } : {}) } });
    } catch (error) {
      return toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
    toast.success(id ? "Ação atualizada" : "Ação criada");
    setEdit(null); refresh();
  }

  const set = (p: Partial<Edit>) => setEdit((e) => (e ? { ...e, ...p } : e));
  const counts = (s: string) => (data ?? []).filter((a) => a.status === s).length;
  const overdue = (a: MeetingAction) => (a.status === "PENDENTE" || a.status === "EM_ANDAMENTO") && !!a.when_date && a.when_date < todayStr();

  return (
    <>
      <PageHeader title="Plano de Ação das Reuniões" subtitle="Reuniões · Comitê 5S" actions={manage && meetings.length > 0 && (
        <Button onClick={() => setEdit({ ...emptyAction(), meeting_id: meetings[0]!.id })}><Plus className="size-4" /> Nova ação</Button>
      )} />
      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(ACTION_STATUS).map(([k, v]) => (
          <div key={k} className="panel p-4"><p className="eyebrow">{v}</p><p className="mt-1 text-2xl font-bold">{counts(k)}</p></div>
        ))}
      </div>
      <Panel>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar ação, responsável ou ata" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-48">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas as situações</SelectItem>{Object.entries(ACTION_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {isLoading ? <LoadingBlock /> : rows.length === 0 ? (
          <EmptyState title="Nenhuma ação" description="As deliberações registradas nas atas aparecem aqui automaticamente." />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ata</TableHead><TableHead>O quê</TableHead><TableHead>Quem</TableHead><TableHead>Prazo</TableHead><TableHead>Situação</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link to="/reunioes/atas/$id" params={{ id: a.meeting_id }} className="font-mono text-xs hover:underline">{a.meetings?.meeting_number}</Link>
                    <p className="text-xs text-muted-foreground">{formatDate(a.meetings?.meeting_date)}</p>
                  </TableCell>
                  <TableCell className="max-w-[360px]"><p className="font-medium">{a.what}</p>{a.topic && <p className="text-xs text-muted-foreground">{a.topic}</p>}</TableCell>
                  <TableCell>{a.who_name ?? "—"}</TableCell>
                  <TableCell className={overdue(a) ? "font-medium text-destructive" : ""}>{formatDate(a.when_date)}{overdue(a) && " · atrasada"}</TableCell>
                  <TableCell><span className="rounded-md bg-muted px-2 py-0.5 text-xs">{ACTION_STATUS[a.status] ?? a.status}</span></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="icon" variant="ghost" title={manage ? "Editar" : "Ver"} onClick={() => setEdit({ ...a })}><Pencil className="size-4" /></Button>
                    {manage && (
                      <ConfirmAction destructive title="Excluir ação?" confirmLabel="Excluir" description="A ação será removida do plano e da ata."
                        trigger={(open) => <Button size="icon" variant="ghost" title="Excluir" onClick={open}><Trash2 className="size-4 text-destructive" /></Button>}
                        onConfirm={async () => {
                          try { await deleteMeetingAction({ data: { id: a.id } }); }
                          catch (error) { toast.error(friendlyError(error)); return; }
                          toast.success("Ação excluída"); refresh();
                        }} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="management-theme max-w-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Ação 5W2H" : "Nova ação 5W2H"}</DialogTitle></DialogHeader>
          {edit && (
            <fieldset disabled={!manage} className="grid gap-3 sm:grid-cols-2">
              <F label="Ata de origem *" className="sm:col-span-2">
                <Select disabled={!manage} value={edit.meeting_id} onValueChange={(v) => set({ meeting_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{meetings.map((m) => <SelectItem key={m.id} value={m.id}>{m.meeting_number} · {m.title} ({formatDate(m.meeting_date)})</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="O quê? *" className="sm:col-span-2"><Input value={edit.what} onChange={(e) => set({ what: e.target.value })} /></F>
              <F label="Por quê?" className="sm:col-span-2"><Textarea rows={2} value={edit.why ?? ""} onChange={(e) => set({ why: nn(e.target.value) })} /></F>
              <F label="Onde?"><Input value={edit.where_text ?? ""} onChange={(e) => set({ where_text: nn(e.target.value) })} /></F>
              <F label="Quem?">
                <PersonSelect disabled={!manage} people={people} value={personKey(edit.who_kind, edit.who_id)}
                  onChange={(p) => set({ who_kind: p?.kind ?? null, who_id: p?.id ?? null, who_name: p?.name ?? null })} />
              </F>
              <F label="Quando?"><Input type="date" value={edit.when_date ?? ""} onChange={(e) => set({ when_date: nn(e.target.value) })} /></F>
              <F label="Quanto custa? (R$)"><Input type="number" min={0} step="0.01" value={edit.how_much ?? ""} onChange={(e) => set({ how_much: e.target.value === "" ? null : Number(e.target.value) })} /></F>
              <F label="Como?" className="sm:col-span-2"><Textarea rows={2} value={edit.how ?? ""} onChange={(e) => set({ how: nn(e.target.value) })} /></F>
              <F label="Assunto">
                <Select disabled={!manage} value={edit.topic ?? "none"} onValueChange={(v) => set({ topic: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{MEETING_TOPICS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Situação">
                <Select disabled={!manage} value={edit.status} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ACTION_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </fieldset>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>{manage ? "Cancelar" : "Fechar"}</Button>
            {manage && <Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
