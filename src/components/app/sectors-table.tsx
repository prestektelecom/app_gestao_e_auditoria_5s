import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Sector, Unit } from "@/lib/queries";
import { ConfirmAction, EmptyState, LoadingBlock, Panel, StatusBadge } from "@/components/app/kit";
import { toggleActive, useInvalidateRegistry } from "@/components/app/unit-sector-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type StatusFilter = "all" | "active" | "inactive";
export const matchStatus = (s: StatusFilter, a: boolean) => s === "all" || (s === "active" ? a : !a);

export function StatusSelect({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatusFilter)}>
      <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os status</SelectItem>
        <SelectItem value="active">Ativos</SelectItem>
        <SelectItem value="inactive">Inativos</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function SectorsTab({ sectors, units, loading, manage, onEdit, hideUnitFilter }: {
  sectors?: Sector[]; units: Unit[]; loading: boolean; manage: boolean; onEdit: (s: Sector) => void; hideUnitFilter?: boolean;
}) {
  const invalidate = useInvalidateRegistry();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [unit, setUnit] = useState("all");
  const unitName = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);
  const list = (sectors ?? []).filter((s) =>
    matchStatus(status, s.active) && (unit === "all" || s.unit_id === unit) &&
    s.name.toLowerCase().includes(q.toLowerCase()));

  if (loading) return <Panel><LoadingBlock /></Panel>;
  if (!sectors?.length) return <Panel><EmptyState title="Nenhum setor cadastrado." description="Cadastre os setores de cada unidade." /></Panel>;

  const actions = (s: Sector) => manage && (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>Editar</Button>
      <ConfirmAction
        title={s.active ? "Inativar setor?" : "Ativar setor?"}
        description={s.active ? `O setor "${s.name}" será inativado. O histórico e o identificador do QR Code são preservados.` : `O setor "${s.name}" voltará a ficar disponível.`}
        confirmLabel={s.active ? "Inativar" : "Ativar"}
        destructive={s.active}
        onConfirm={async () => { await toggleActive("sectors", s.id, !s.active); await invalidate(); }}
        trigger={(open) => <Button variant="ghost" size="sm" onClick={open}>{s.active ? "Inativar" : "Ativar"}</Button>}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar setor" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!hideUnitFilter && (
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as unidades</SelectItem>
              {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <StatusSelect value={status} onChange={setStatus} />
      </div>
      <Panel className="p-0 sm:p-0">
        {list.length === 0 ? <div className="p-5"><EmptyState compact title="Nenhum setor encontrado." /></div> : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="eyebrow pl-6">Setor</TableHead>
                  {!hideUnitFilter && <TableHead className="eyebrow">Unidade</TableHead>}
                  <TableHead className="eyebrow">Status</TableHead>
                  <TableHead className="eyebrow pr-6 text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {list.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6">
                        <p className="font-medium">{s.name}</p>
                        {s.description && <p className="line-clamp-1 text-xs text-muted-foreground">{s.description}</p>}
                      </TableCell>
                      {!hideUnitFilter && <TableCell className="text-muted-foreground">{unitName.get(s.unit_id)}</TableCell>}
                      <TableCell><StatusBadge active={s.active} /></TableCell>
                      <TableCell className="pr-6">{actions(s)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y divide-border md:hidden">
              {list.map((s) => (
                <div key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{unitName.get(s.unit_id)}</p></div>
                    <StatusBadge active={s.active} />
                  </div>
                  <div className="mt-2">{actions(s)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
