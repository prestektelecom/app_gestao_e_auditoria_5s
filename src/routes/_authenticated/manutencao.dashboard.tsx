import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { sectorsQuery, unitsQuery } from "@/lib/queries";
import { isLate, maintNotesQuery, NOTE_STATUS } from "@/lib/maintenance";
import { EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/manutencao/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard de Manutenção — Prestek 5S" },
      { name: "description", content: "Indicadores das notas de manutenção 5S por situação, unidade, setor e período." },
      { property: "og:title", content: "Dashboard de Manutenção — Prestek 5S" },
      { property: "og:description", content: "Indicadores das notas de manutenção 5S por situação, unidade, setor e período." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS_COLOR: Record<string, string> = {
  ABERTA: "var(--warning)", EM_ANDAMENTO: "var(--primary)", CONCLUIDA: "var(--success)", CANCELADA: "var(--muted-foreground)",
};
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function Page() {
  const { role } = useAuth();
  const notes = useQuery(maintNotesQuery);
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [unit, setUnit] = useState("all");
  const [sector, setSector] = useState("all");
  const [status, setStatus] = useState("all");

  const data = useMemo(() => (notes.data ?? []).filter((n) =>
    (!from || n.note_date >= from) && (!to || n.note_date <= to) && (unit === "all" || n.unit_id === unit)
    && (sector === "all" || n.sector_id === sector) && (status === "all" || n.status === status)), [notes.data, from, to, unit, sector, status]);

  const stats = useMemo(() => {
    const done = data.filter((n) => n.status === "CONCLUIDA" && n.completed_at);
    const avg = done.length ? done.reduce((s, n) => s + (new Date(n.completed_at!).getTime() - new Date(n.created_at).getTime()), 0) / done.length / 86400000 : null;
    const byStatus = NOTE_STATUS.map((s) => ({ key: s.value, name: s.label, value: data.filter((n) => n.status === s.value).length }));
    const group = (key: (n: (typeof data)[number]) => string) => {
      const m = new Map<string, number>();
      data.forEach((n) => m.set(key(n), (m.get(key(n)) ?? 0) + 1));
      return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    };
    const months = new Map<string, { label: string; abertas: number; concluidas: number }>();
    data.forEach((n) => {
      const k = n.note_date.slice(0, 7);
      const e = months.get(k) ?? { label: `${MONTHS[Number(k.slice(5)) - 1]}/${k.slice(2, 4)}`, abertas: 0, concluidas: 0 };
      e.abertas++;
      months.set(k, e);
    });
    data.filter((n) => n.completed_at).forEach((n) => {
      const k = n.completed_at!.slice(0, 7);
      const e = months.get(k) ?? { label: `${MONTHS[Number(k.slice(5)) - 1]}/${k.slice(2, 4)}`, abertas: 0, concluidas: 0 };
      e.concluidas++;
      months.set(k, e);
    });
    return {
      total: data.length, byStatus, avg, late: data.filter((n) => isLate(n)).length,
      withImages: data.filter((n) => n.maintenance_note_images.length).length,
      viaQr: data.filter((n) => n.source === "QR").length,
      byUnit: group((n) => n.unit_name), bySector: group((n) => `${n.sector_name} (${n.unit_name})`).slice(0, 10),
      byMonth: [...months].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v),
    };
  }, [data]);

  if (!can(role, "maintenance.view")) return <Restricted />;
  const sectorOpts = (sectors.data ?? []).filter((s) => unit === "all" || s.unit_id === unit);
  const card = (label: string, value: string | number, hint?: string) => (
    <div className="panel p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
  );
  return (
    <>
      <PageHeader title="Dashboard de Manutenção" subtitle="Manutenção" />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="grid gap-1.5"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Unidade</Label>
            <Select value={unit} onValueChange={(v) => { setUnit(v); setSector("all"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{(units.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid gap-1.5"><Label>Setor</Label>
            <Select value={sector} onValueChange={setSector}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{sectorOpts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid gap-1.5"><Label>Situação</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{NOTE_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
      </Panel>
      {notes.isLoading ? <Panel><LoadingBlock /></Panel> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            {card("Total de notas", stats.total)}
            {stats.byStatus.map((s) => <div key={s.key}>{card(s.name, s.value)}</div>)}
            {card("Atrasadas", stats.late, "prazo vencido")}
            {card("Tempo médio", stats.avg == null ? "—" : `${stats.avg.toFixed(1)} d`, "até concluir")}
            {card("Via QR Code", stats.viaQr, `${stats.withImages} com imagens`)}
          </div>
          {stats.total === 0 ? <Panel><EmptyState title="Nenhuma nota no período." description="As notas abertas pelos setores aparecerão aqui." /></Panel> : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Notas por situação">
                <div className="h-64"><ResponsiveContainer>
                  <PieChart><Tooltip /><Pie data={stats.byStatus.filter((s) => s.value)} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} label isAnimationActive={false}>
                    {stats.byStatus.filter((s) => s.value).map((s) => <Cell key={s.key} fill={STATUS_COLOR[s.key]} />)}
                  </Pie></PieChart>
                </ResponsiveContainer></div>
              </Panel>
              <Panel title="Evolução mensal">
                <div className="h-64"><ResponsiveContainer>
                  <LineChart data={stats.byMonth}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" /><Tooltip />
                    <Line dataKey="abertas" name="Abertas" stroke="var(--warning)" strokeWidth={2.5} isAnimationActive={false} />
                    <Line dataKey="concluidas" name="Concluídas" stroke="var(--success)" strokeWidth={2.5} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer></div>
              </Panel>
              <Panel title="Notas por unidade">
                <div className="h-64"><ResponsiveContainer>
                  <BarChart data={stats.byUnit}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" /><Tooltip />
                    <Bar dataKey="value" name="Notas" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer></div>
              </Panel>
              <Panel title="Setores com mais notas">
                <div className="h-64"><ResponsiveContainer>
                  <BarChart data={stats.bySector} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" /><Tooltip />
                    <Bar dataKey="value" name="Notas" fill="var(--accent-foreground)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer></div>
              </Panel>
            </div>
          )}
        </>
      )}
    </>
  );
}
