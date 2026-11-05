import { Link } from "@tanstack/react-router";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatScore, senseLabel } from "@/lib/checklist";
import { formatDate } from "@/lib/format";
import { cleanFilters, type Analysis, type Filters, type Medals } from "@/lib/analytics";
import { EmptyState, Panel } from "./kit";
import { Bar, Delta, ScoreMedal } from "./analytics-ui";

const keep = (f: Filters, patch: Partial<Filters> = {}) => cleanFilters({ ...f, ...patch }) as never;

export function SectorRanking({ a, prev, medals, f, title = "Ranking de Setores", limit }: {
  a: Analysis; prev: Map<string, number>; medals: Medals; f: Filters; title?: string; limit?: number;
}) {
  const rows = limit ? a.sectorScores.slice(0, limit) : a.sectorScores;
  return (
    <Panel title={title} aside={<span className="text-xs text-muted-foreground">Última auditoria concluída de cada setor</span>}>
      {!rows.length ? <EmptyState compact title="Nenhuma auditoria encontrada para este período." /> : (
        <ol className="grid gap-1.5">
          {rows.map((s, i) => {
            const pv = prev.get(s.sector_id);
            return (
              <li key={s.sector_id}>
                <Link to="/analise/setor/$id" params={{ id: s.sector_id }} search={keep(f, { sector: "" })}
                  className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-foreground/5">
                  <span className="font-mono text-sm text-muted-foreground">{i + 1}º</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.sector_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.unit_name} · {formatDate(s.finished_at)} · NC {s.nc} · NCP {s.ncp}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <ScoreMedal score={s.score} medals={medals} />
                    {pv !== undefined ? <Delta value={s.score - pv} /> : <span className="text-[11px] text-muted-foreground">Sem base anterior</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function UnitRanking({ a, prev, medals, f }: { a: Analysis; prev: Map<string, number>; medals: Medals; f: Filters }) {
  return (
    <Panel title="Ranking de Unidades" aside={<span className="text-xs text-muted-foreground">Nota e cobertura são indicadores separados</span>}>
      {!a.unitScores.length && !a.unitsWithout.length ? <EmptyState compact title="Nenhuma auditoria encontrada para este período." /> : (
        <ol className="grid gap-1.5">
          {a.unitScores.map((u, i) => {
            const pv = prev.get(u.unit_id);
            const cov = u.coverage.total ? (u.coverage.done / u.coverage.total) * 100 : 0;
            return (
              <li key={u.unit_id}>
                <Link to="/analise/unidade/$id" params={{ id: u.unit_id }} search={keep(f, { unit: "", sector: "" })}
                  className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-foreground/5">
                  <span className="font-mono text-sm text-muted-foreground">{i + 1}º</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block text-xs text-muted-foreground">Cobertura {u.coverage.done}/{u.coverage.total} — {formatScore(cov)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5"><ScoreMedal score={u.score} medals={medals} />{pv !== undefined && <Delta value={u.score - pv} />}</span>
                </Link>
              </li>
            );
          })}
          {a.unitsWithout.map((u) => (
            <li key={u.id}>
              <Link to="/analise/unidade/$id" params={{ id: u.id }} search={keep(f, { unit: "", sector: "" })}
                className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-xl px-2 py-2 text-muted-foreground transition hover:bg-foreground/5">
                <span className="font-mono text-sm">—</span><span className="truncate text-sm">{u.name}</span><span className="text-xs">Sem auditoria no período</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function CoverageBlock({ a, f, units }: { a: Analysis; f: Filters; units: { id: string; name: string }[] }) {
  const byUnit = units.map((u) => ({ u, list: a.pending.filter((s) => s.unit_id === u.id) })).filter((g) => g.list.length);
  return (
    <Panel title="Cobertura 5S">
      <p className="font-display text-2xl font-bold">{a.coverage.done} de {a.coverage.total} setores auditados</p>
      <div className="mt-2 flex items-center gap-3"><Bar value={a.coverage.pct} /><span className="font-mono text-sm">{a.coverage.pct === null ? "—" : formatScore(a.coverage.pct)}</span></div>
      <h3 className="mt-5 text-sm font-semibold">Setores pendentes</h3>
      {!byUnit.length ? <p className="mt-2 text-sm text-muted-foreground">{a.coverage.total ? "Todos os Setores foram auditados neste período." : "Nenhum setor ativo no filtro."}</p> : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {byUnit.map(({ u, list }) => (
            <div key={u.id}>
              <p className="eyebrow">{u.name}</p>
              <ul className="mt-1 grid gap-0.5">
                {list.map((s) => (
                  <li key={s.id}><Link to="/analise/setor/$id" params={{ id: s.id }} search={keep(f, { sector: "" })} className="flex items-center gap-2 text-sm hover:text-primary">
                    <span className="size-2 rounded-full bg-destructive" />{s.name}<span className="text-xs text-muted-foreground">Pendente</span></Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function SenseBars({ a, f, medals, linkable = true }: { a: Analysis; f: Filters; medals: Medals; linkable?: boolean }) {
  const valid = a.senses.filter((s) => s.score !== null);
  const worst = valid.length ? valid.reduce((m, s) => (s.score! < m.score! ? s : m)) : null;
  return (
    <Panel title="Desempenho por Senso" aside={worst && <span className="text-xs text-muted-foreground">Mais frágil: <b className="text-destructive">{worst.label}</b></span>}>
      {!valid.length ? <EmptyState compact title="Nenhuma auditoria encontrada para este período." /> : (
        <ul className="grid gap-3">
          {a.senses.map((s) => {
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={cn("font-medium", worst?.code === s.code && "text-destructive")}>{s.label}</span>
                  <span className="flex items-center gap-3"><span className="text-xs text-muted-foreground">NC {s.nc} · NCP {s.ncp}</span><ScoreMedal score={s.score} medals={medals} /></span>
                </div>
                <Bar value={s.score} className="mt-1.5" />
              </>
            );
            return <li key={s.code}>{linkable
              ? <Link to="/analise/senso/$code" params={{ code: s.code }} search={keep(f, { sense: "" })} className="block rounded-lg p-1.5 transition hover:bg-foreground/5">{inner}</Link>
              : <div className="p-1.5">{inner}</div>}</li>;
          })}
        </ul>
      )}
    </Panel>
  );
}

export function HistoryChart({ data, title = "Evolução histórica" }: { data: { label: string; score: number | null }[]; title?: string }) {
  const has = data.some((d) => d.score !== null);
  return (
    <Panel title={title} aside={<span className="text-xs text-muted-foreground">Nota consolidada por mês</span>}>
      {!has ? <EmptyState compact title="Sem auditorias concluídas nos últimos meses." /> : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip formatter={(v: number) => formatScore(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="score" name="Nota" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

export function TopNc({ a, limit = 8 }: { a: Analysis; limit?: number }) {
  return (
    <Panel title="Principais pontos de atenção" aside={<span className="text-xs text-muted-foreground">Perguntas com mais NC/NCP</span>}>
      {!a.topQuestions.length ? <EmptyState compact title="Nenhuma Não Conformidade registrada." /> : (
        <ol className="grid gap-2">
          {a.topQuestions.slice(0, limit).map((q, i) => (
            <li key={q.key} className="flex gap-3 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1"><span className="block">{q.text}</span><span className="text-xs text-muted-foreground">{senseLabel(q.sense)}</span></span>
              <span className="shrink-0 text-right text-xs"><b className="text-sm">{q.nc + q.ncp}</b> ocorr.<br /><span className="text-muted-foreground">NC {q.nc} · NCP {q.ncp}</span></span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function RecurrenceList({ items, limit = 10 }: { items: { sector_name: string; unit_name: string; question: string; order: number; dates: string[]; count: number; sense: string }[]; limit?: number }) {
  const mon = (d: string) => new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(new Date(d));
  return (
    <Panel title="NC recorrentes" aside={<span className="text-xs text-muted-foreground">NC/NCP em auditorias sucessivas do mesmo setor</span>}>
      {!items.length ? <EmptyState compact title="Nenhuma reincidência detectada." /> : (
        <ul className="grid gap-2">
          {items.slice(0, limit).map((r, i) => (
            <li key={i} className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="text-xs font-semibold text-destructive">Reincidência detectada · {r.count}× seguidas</p>
              <p className="mt-1">Pergunta {r.order}: “{r.question}”</p>
              <p className="mt-1 text-xs text-muted-foreground">{r.sector_name} · {r.unit_name} · {senseLabel(r.sense)} · {r.dates.map(mon).join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
