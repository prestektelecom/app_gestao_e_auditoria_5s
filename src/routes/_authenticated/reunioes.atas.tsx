import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { deleteMeeting } from "@/lib/meetings.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDate, friendlyError } from "@/lib/format";
import { MEETING_STATUS, MEETING_TYPES, meetingsQuery } from "@/lib/meetings";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const T = "Atas de Reunião — Prestek 5S";
const D = "Atas das reuniões do Comitê 5S: participantes, pauta, deliberações e plano de ação.";
export const Route = createFileRoute("/_authenticated/reunioes/atas")({
  head: () => ({ meta: [
    { title: T }, { name: "description", content: D }, { property: "og:title", content: T },
    { property: "og:description", content: D }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(meetingsQuery);
  const [q, setQ] = useState("");
  const rows = useMemo(() => (data ?? []).filter((m) =>
    `${m.meeting_number} ${m.title} ${m.topics.join(" ")}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  if (!can(role, "meetings.view")) return <Restricted />;
  const manage = can(role, "meetings.manage");

  return (
    <>
      <PageHeader title="Atas de Reunião" subtitle="Reuniões · Comitê 5S" actions={manage && (
        <Button asChild><Link to="/reunioes/atas/$id" params={{ id: "nova" }}><Plus className="size-4" /> Nova ata</Link></Button>
      )} />
      <Panel>
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por número, título ou assunto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {isLoading ? <LoadingBlock /> : rows.length === 0 ? (
          <EmptyState title="Nenhuma ata registrada" description="Registre a primeira reunião do Comitê 5S para acompanhar decisões e ações." />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nº</TableHead><TableHead>Data</TableHead><TableHead>Título</TableHead><TableHead>Assuntos</TableHead>
              <TableHead className="text-center">Participantes</TableHead><TableHead className="text-center">Ações</TableHead>
              <TableHead>Situação</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.meeting_number}</TableCell>
                  <TableCell>{formatDate(m.meeting_date)}</TableCell>
                  <TableCell>
                    <Link to="/reunioes/atas/$id" params={{ id: m.id }} className="font-medium hover:underline">{m.title}</Link>
                    <p className="text-xs text-muted-foreground">{MEETING_TYPES[m.meeting_type] ?? m.meeting_type}</p>
                  </TableCell>
                  <TableCell className="max-w-[240px] text-xs text-muted-foreground">{m.topics.join(", ") || "—"}</TableCell>
                  <TableCell className="text-center">{m.participants}</TableCell>
                  <TableCell className="text-center">{m.actions}</TableCell>
                  <TableCell><span className="rounded-md bg-muted px-2 py-0.5 text-xs">{MEETING_STATUS[m.status] ?? m.status}</span></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button asChild size="icon" variant="ghost" title="Abrir"><Link to="/reunioes/atas/$id" params={{ id: m.id }}><Pencil className="size-4" /></Link></Button>
                    {manage && (
                      <ConfirmAction destructive title="Excluir ata?" confirmLabel="Excluir"
                        description={`A ata ${m.meeting_number} e todas as ações do seu plano de ação serão excluídas.`}
                        trigger={(open) => <Button size="icon" variant="ghost" title="Excluir" onClick={open}><Trash2 className="size-4 text-destructive" /></Button>}
                        onConfirm={async () => {
                          try { await deleteMeeting({ data: { id: m.id } }); }
                          catch (error) { toast.error(friendlyError(error)); return; }
                          toast.success("Ata excluída");
                          qc.invalidateQueries({ queryKey: ["meetings"] });
                          qc.invalidateQueries({ queryKey: ["meeting-actions"] });
                        }} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
