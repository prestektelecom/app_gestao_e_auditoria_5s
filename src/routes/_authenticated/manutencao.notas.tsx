import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { sectorsQuery, unitsQuery } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { maintNotesQuery, statusLabel, statusTone, type MaintNote } from "@/lib/maintenance";
import { MaintenanceForm } from "@/components/app/maintenance-form";
import { NoteDialog, NoteRowActions } from "@/components/app/maintenance-note-dialog";
import { EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/manutencao/notas")({
  head: () => ({
    meta: [
      { title: "Notas de Manutenção — Prestek 5S" },
      { name: "description", content: "Abertura de notas de manutenção para pequenos reparos e serviços 5S." },
      { property: "og:title", content: "Notas de Manutenção — Prestek 5S" },
      { property: "og:description", content: "Abertura de notas de manutenção para pequenos reparos e serviços 5S." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const { role, profile } = useAuth();
  const qc = useQueryClient();
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const notes = useQuery(maintNotesQuery);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ note: MaintNote; edit: boolean } | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (notes.data ?? []).filter((n) => !t || [n.note_number, n.requester_name, n.unit_name, n.sector_name, n.description].join(" ").toLowerCase().includes(t));
  }, [notes.data, q]);

  if (!can(role, "maintenance.view")) return <Restricted />;
  const manage = can(role, "maintenance.manage");
  return (
    <>
      <PageHeader title="Notas de Manutenção" subtitle="Manutenção" />
      <Panel title="Nova Nota" tape>
        <MaintenanceForm
          mode={{ kind: "internal", units: units.data ?? [], sectors: sectors.data ?? [], defaultName: profile?.name }}
          onDone={() => qc.invalidateQueries({ queryKey: ["maint-notes"] })}
        />
      </Panel>
      <Panel title="Notas abertas recentemente" aside={
        <div className="relative w-64"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      }>
        {notes.isLoading ? <LoadingBlock /> : list.length === 0 ? <EmptyState compact title="Nenhuma nota encontrada." /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Solicitante</TableHead><TableHead>Unidade / Setor</TableHead><TableHead>Descrição</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.slice(0, 50).map((n) => (
                <TableRow key={n.id} className="cursor-pointer" onClick={() => setOpen({ note: n, edit: false })}>
                  <TableCell className="font-mono text-xs">{n.note_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(n.note_date)} {n.note_time.slice(0, 5)}</TableCell>
                  <TableCell>{n.requester_name}</TableCell>
                  <TableCell>{n.unit_name} · {n.sector_name}</TableCell>
                  <TableCell className="max-w-xs truncate">{n.description}</TableCell>
                  <TableCell><span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", statusTone(n.status))}>{statusLabel(n.status)}</span></TableCell>
                  <TableCell><NoteRowActions note={n} manage={manage} onOpen={(note, edit) => setOpen({ note, edit })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      {open && <NoteDialog key={open.note.id + open.edit} note={open.note} manage={manage} startEditing={open.edit} onClose={() => setOpen(null)} />}
    </>
  );
}
