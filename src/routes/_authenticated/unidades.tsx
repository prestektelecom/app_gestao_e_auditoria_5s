import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, MoreHorizontal, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { sectorsQuery, unitsQuery, type Sector, type Unit } from "@/lib/queries";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, Panel, StatusBadge } from "@/components/app/kit";
import { SectorDialog, UnitDialog, toggleActive, useInvalidateRegistry } from "@/components/app/unit-sector-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/unidades")({
  head: () => ({
    meta: [
      { title: "Unidades e Setores — Prestek 5S" },
      { name: "description", content: "Cadastro de unidades e setores do Programa 5S." },
      { property: "og:title", content: "Unidades e Setores — Prestek 5S" },
      { property: "og:description", content: "Cadastro de unidades e setores do Programa 5S." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UnitsPage,
});

import { SectorsTab, StatusSelect, matchStatus, type StatusFilter } from "@/components/app/sectors-table";

function UnitsPage() {
  const { role } = useAuth();
  const manage = can(role, "units.manage");
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const [unitDlg, setUnitDlg] = useState<{ open: boolean; unit?: Unit | null }>({ open: false });
  const [sectorDlg, setSectorDlg] = useState<{ open: boolean; sector?: Sector | null }>({ open: false });
  const [tab, setTab] = useState("units");

  return (
    <>
      <PageHeader
        title="Unidades e Setores"
        subtitle="Estrutura organizacional"
        actions={manage && (
          tab === "units"
            ? <Button onClick={() => setUnitDlg({ open: true, unit: null })}><Plus className="size-4" /> Nova Unidade</Button>
            : <Button onClick={() => setSectorDlg({ open: true, sector: null })} disabled={!units.data?.some((u) => u.active)}><Plus className="size-4" /> Novo Setor</Button>
        )}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="units">Unidades</TabsTrigger>
          <TabsTrigger value="sectors">Setores</TabsTrigger>
        </TabsList>
        <TabsContent value="units" className="mt-4">
          <UnitsTab units={units.data} loading={units.isLoading} manage={manage} onNew={() => setUnitDlg({ open: true })} onEdit={(u) => setUnitDlg({ open: true, unit: u })} />
        </TabsContent>
        <TabsContent value="sectors" className="mt-4">
          <SectorsTab sectors={sectors.data} units={units.data ?? []} loading={sectors.isLoading} manage={manage} onEdit={(s) => setSectorDlg({ open: true, sector: s })} />
        </TabsContent>
      </Tabs>
      <UnitDialog open={unitDlg.open} unit={unitDlg.unit} onOpenChange={(o) => setUnitDlg({ open: o })} />
      <SectorDialog open={sectorDlg.open} sector={sectorDlg.sector} units={units.data ?? []} onOpenChange={(o) => setSectorDlg({ open: o })} />
    </>
  );
}

function UnitsTab({ units, loading, manage, onNew, onEdit }: {
  units?: Unit[]; loading: boolean; manage: boolean; onNew: () => void; onEdit: (u: Unit) => void;
}) {
  const invalidate = useInvalidateRegistry();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const list = useMemo(() => (units ?? []).filter((u) =>
    matchStatus(status, u.active) &&
    `${u.name} ${u.code ?? ""} ${u.city ?? ""}`.toLowerCase().includes(q.toLowerCase())), [units, q, status]);

  if (loading) return <Panel><LoadingBlock /></Panel>;
  if (!units?.length) return (
    <Panel><EmptyState title="Nenhuma unidade cadastrada." description="Cadastre a primeira unidade para começar."
      action={manage && <Button onClick={onNew}><Plus className="size-4" /> Nova Unidade</Button>} /></Panel>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar unidade, código ou cidade" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <StatusSelect value={status} onChange={setStatus} />
      </div>
      {list.length === 0 ? <Panel><EmptyState compact title="Nenhuma unidade encontrada." description="Ajuste a busca ou os filtros." /></Panel> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((u, i) => (
            <div key={u.id} className="panel rise flex flex-col p-5" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">{u.code || "Unidade"}</p>
                  <Link to="/unidades/$id" params={{ id: u.id }} className="mt-1 block truncate font-display text-lg font-semibold hover:text-primary">{u.name}</Link>
                </div>
                <StatusBadge active={u.active} on="Ativa" off="Inativa" />
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5" /> {[u.city, u.state].filter(Boolean).join(" / ") || "Local não informado"}
              </p>
              <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
                <div>
                  <p className="font-display text-2xl font-bold">{u.sector_count}</p>
                  <p className="eyebrow">setores</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild><Link to="/unidades/$id" params={{ id: u.id }}>Detalhes</Link></Button>
                  {manage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label="Ações"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(u)}>Editar</DropdownMenuItem>
                        <ConfirmAction
                          title={u.active ? "Inativar unidade?" : "Ativar unidade?"}
                          description={u.active ? `A unidade "${u.name}" deixará de aparecer nas seleções. O histórico é preservado.` : `A unidade "${u.name}" voltará a ficar disponível.`}
                          confirmLabel={u.active ? "Inativar" : "Ativar"}
                          destructive={u.active}
                          onConfirm={async () => { await toggleActive("units", u.id, !u.active); await invalidate(); }}
                          trigger={(open) => <DropdownMenuItem onSelect={(e) => { e.preventDefault(); open(); }}>{u.active ? "Inativar" : "Ativar"}</DropdownMenuItem>}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

