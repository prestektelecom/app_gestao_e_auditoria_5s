import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { sectorsQuery, unitsQuery, type Sector } from "@/lib/queries";
import { LoadingBlock, PageHeader, Panel, StatusBadge, EmptyState } from "@/components/app/kit";
import { SectorDialog, UnitDialog } from "@/components/app/unit-sector-forms";
import { Button } from "@/components/ui/button";
import { SectorsTab } from "@/components/app/sectors-table";

export const Route = createFileRoute("/_authenticated/unidades_/$id")({
  head: () => ({
    meta: [
      { title: "Detalhes da Unidade — Prestek 5S" },
      { name: "description", content: "Dados da unidade e seus setores." },
      { property: "og:title", content: "Detalhes da Unidade — Prestek 5S" },
      { property: "og:description", content: "Dados da unidade e seus setores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UnitDetail,
});

function UnitDetail() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const manage = can(role, "units.manage");
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const [editUnit, setEditUnit] = useState(false);
  const [sectorDlg, setSectorDlg] = useState<{ open: boolean; sector?: Sector | null }>({ open: false });

  if (units.isLoading) return <Panel><LoadingBlock /></Panel>;
  const unit = units.data?.find((u) => u.id === id);
  if (!unit) return <Panel><EmptyState title="Unidade não encontrada." action={<Button asChild variant="outline"><Link to="/unidades">Voltar</Link></Button>} /></Panel>;
  const own = (sectors.data ?? []).filter((s) => s.unit_id === id);

  return (
    <>
      <Link to="/unidades" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Unidades e Setores
      </Link>
      <PageHeader
        title={unit.name}
        subtitle={unit.code ? `Unidade · ${unit.code}` : "Unidade"}
        actions={manage && (
          <>
            <Button variant="outline" onClick={() => setEditUnit(true)}>Editar unidade</Button>
            {unit.active && <Button onClick={() => setSectorDlg({ open: true, sector: null })}><Plus className="size-4" /> Novo Setor</Button>}
          </>
        )}
      />
      <Panel tape>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Endereço", unit.address || "—"],
            ["Cidade / UF", [unit.city, unit.state].filter(Boolean).join(" / ") || "—"],
            ["Setores", String(own.length)],
            ["Atualizado em", formatDateTime(unit.updated_at)],
          ].map(([k, v]) => (<div key={k}><dt className="eyebrow">{k}</dt><dd className="mt-1 text-sm">{v}</dd></div>))}
          <div><dt className="eyebrow">Status</dt><dd className="mt-1"><StatusBadge active={unit.active} on="Ativa" off="Inativa" /></dd></div>
        </dl>
      </Panel>
      <h2 className="text-lg font-semibold">Setores da unidade</h2>
      <SectorsTab sectors={own} units={units.data ?? []} loading={sectors.isLoading} manage={manage} hideUnitFilter
        onEdit={(s) => setSectorDlg({ open: true, sector: s })} />
      <UnitDialog open={editUnit} unit={unit} onOpenChange={setEditUnit} />
      <SectorDialog open={sectorDlg.open} sector={sectorDlg.sector} units={units.data ?? []} defaultUnitId={id}
        onOpenChange={(o) => setSectorDlg({ open: o })} />
    </>
  );
}
