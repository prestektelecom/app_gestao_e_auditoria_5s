import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { isLate, maintNotesQuery, NOTE_STATUS, priorityLabel, statusLabel, statusTone, type MaintNote } from "@/lib/maintenance";
import { NoteDialog, NoteRowActions } from "@/components/app/maintenance-note-dialog";
import { EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manutencao/gestao")({
  head: () => ({
    meta: [
      { title: "Gestão de Manutenção — Prestek 5S" },
      { name: "description", content: "Gerencie as notas de manutenção abertas: situação, prioridade, responsável e prazo." },
      { property: "og:title", content: "Gestão de Manutenção — Prestek 5S" },
      { property: "og:description", content: "Gerencie as notas de manutenção abertas: situação, prioridade, responsável e prazo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { role } = useAuth();
  const notes = useQuery(maintNotesQuery);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ATIVAS");
  const [editing, setEditing] = useState<{ note: MaintNote; edit: boolean } | null>(null);
  const counts = useMemo(() => Object.fromEntries(NOTE_STATUS.map((s) => [s.value, (notes.data ?? []).filter((n) => n.status === s.value).length])), [notes.data]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (notes.data ?? []).filter((n) =>
      (status === "TODAS" || (status === "ATIVAS" ? n.status === "ABERTA" || n.status === "EM_ANDAMENTO" : n.status === status))
      && (!t || [n.note_number, n.requester_name, n.unit_name, n.sector_name, n.description, n.assignee_name ?? ""].join(" ").toLowerCase().includes(t)));
  }, [notes.data, q, status]);

  if (!can(role, "maintenance.view")) return <Restricted />;
  const manage = can(role, "maintenance.manage");
  return (
    <>
      <PageHeader title="Gestão de Manutenção" subtitle="Manutenção" actions={<Button asChild><Link to="/manutencao/notas"><Plus className="size-4" /> Nova nota</Link></Button>} />
      <div className="grid gap-3 sm:grid-cols-4">
        {NOTE_STATUS.map((s) => (
          <button key={s.value} type="button" onClick={() => setStatus(s.value)} className={cn("panel p-4 text-left", status === s.value && "ring-2 ring-primary")}>
            <p className="text-xs text-muted-foreground">{s.label}</p><p className="text-2xl font-bold">{counts[s.value] ?? 0}</p>
          </button>
        ))}
      </div>
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar nota, solicitante, setor ou responsável" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ATIVAS">Abertas + em andamento</SelectItem>
              <SelectItem value="TODAS">Todas</SelectItem>
              {NOTE_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {notes.isLoading ? <LoadingBlock /> : list.length === 0 ? <EmptyState compact title="Nenhuma nota nesta situação." /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Abertura</TableHead><TableHead>Unidade / Setor</TableHead><TableHead>Descrição</TableHead><TableHead>Prioridade</TableHead><TableHead>Responsável</TableHead><TableHead>Prazo</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((n) => (
                <TableRow key={n.id} className="cursor-pointer" onClick={() => setEditing({ note: n, edit: false })}>
                  <TableCell className="font-mono text-xs">{n.note_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(n.note_date)} {n.note_time.slice(0, 5)}</TableCell>
                  <TableCell>{n.unit_name} · {n.sector_name}</TableCell>
                  <TableCell className="max-w-xs truncate">{n.description}</TableCell>
                  <TableCell>{priorityLabel(n.priority)}</TableCell>
                  <TableCell>{n.assignee_name || "—"}</TableCell>
                  <TableCell className={cn(isLate(n) && "font-medium text-destructive")}>{n.due_date ? formatDate(n.due_date) : "—"}</TableCell>
                  <TableCell><span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", statusTone(n.status))}>{statusLabel(n.status)}</span></TableCell>
                  <TableCell><NoteRowActions note={n} manage={manage} onOpen={(note, edit) => setEditing({ note, edit })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      {editing && <NoteDialog key={editing.note.id + editing.edit} note={editing.note} manage={manage} startEditing={editing.edit} onClose={() => setEditing(null)} />}
    </>
  );
}
