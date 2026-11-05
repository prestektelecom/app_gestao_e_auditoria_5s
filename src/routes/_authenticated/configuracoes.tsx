import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveSetting } from "@/lib/checklist.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatPercent, friendlyError } from "@/lib/format";
import { settingsQuery, type Periodicity, type Settings } from "@/lib/queries";
import { LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { Field } from "@/components/app/unit-sector-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Prestek 5S" },
      { name: "description", content: "Periodicidade, pontuação e medalhas do Programa 5S." },
      { property: "og:title", content: "Configurações — Prestek 5S" },
      { property: "og:description", content: "Periodicidade, pontuação e medalhas do Programa 5S." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

const PERIODS: Record<Periodicity, string> = { weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal" };

function SettingsPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(settingsQuery);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (data) setS(structuredClone(data)); }, [data]);

  if (!can(role, "settings.view")) return <Restricted />;
  if (isLoading || !s) return <Panel><LoadingBlock /></Panel>;
  const editable = can(role, "settings.manage");

  async function save(key: keyof Settings, value: unknown, validate?: () => string | null) {
    const err = validate?.();
    if (err) return toast.error(err);
    setBusy(key);
    try {
      await saveSetting({ data: { key, value: value as never } });
    } catch (error) {
      return toast.error(friendlyError(error));
    } finally {
      setBusy(null);
    }
    toast.success("Configuração salva.");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  const num = (v: string) => (v === "" ? NaN : Number(v.replace(",", ".")));
  const m = s.medals;
  const sc = s.scoring;
  const medalsError = () => {
    const vals = [m.gold_min, m.silver_min, m.bronze_min];
    if (vals.some((v) => !Number.isFinite(v))) return "Preencha todos os limites.";
    if (m.gold_min > 100) return "O limite do Ouro não pode passar de 100%.";
    if (m.bronze_min < 70) return "O Bronze deve iniciar em 70% ou mais (abaixo de 70% = Sem índice).";
    if (!(m.gold_min > m.silver_min && m.silver_min > m.bronze_min)) return "As faixas devem ser crescentes: Bronze < Prata < Ouro, sem sobreposição.";
    return null;
  };
  const scoringError = () => {
    const vals = [sc.conforme, sc.nc_parcial, sc.nao_conforme];
    if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return "As pontuações devem estar entre 0% e 100%.";
    if (!(sc.conforme > sc.nc_parcial && sc.nc_parcial > sc.nao_conforme)) return "A pontuação deve ser: Conforme > Parcial > Não Conforme.";
    return null;
  };
  const upper = (v: number) => formatPercent(Math.max(v - 0.01, 0), 2);

  return (
    <>
      <PageHeader title="Configurações" subtitle="Parâmetros do programa" />
      <Panel label="a" title="Auditorias" tape>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-64">
            <Field label="Periodicidade padrão">
              <Select disabled={!editable} value={s.audit_periodicity} onValueChange={(v) => setS({ ...s, audit_periodicity: v as Periodicity })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PERIODS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          {editable && (
            <Button disabled={busy === "audit_periodicity"} onClick={() => save("audit_periodicity", s.audit_periodicity, () => s.audit_periodicity in PERIODS ? null : "Periodicidade inválida.")}>
              {busy === "audit_periodicity" && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          )}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel label="b" title="Pontuação">
          <div className="grid gap-4">
            {([["conforme", "Conforme"], ["nc_parcial", "Não Conforme Parcial"], ["nao_conforme", "Não Conforme"]] as const).map(([k, l]) => (
              <Field key={k} label={`${l} (%)`}>
                <Input type="number" min={0} max={100} step="0.01" disabled={!editable}
                  value={Number.isFinite(sc[k]) ? sc[k] : ""} onChange={(e) => setS({ ...s, scoring: { ...sc, [k]: num(e.target.value) } })} />
              </Field>
            ))}
            <div className="empty-well flex items-center justify-between px-4 py-3 text-sm">
              <span>Não se Aplica</span><span className="text-muted-foreground">Excluir da base de cálculo</span>
            </div>
            {editable && <Button className="w-fit" disabled={busy === "scoring"} onClick={() => save("scoring", { ...sc, nao_se_aplica: "excluded" }, scoringError)}>
              {busy === "scoring" && <Loader2 className="size-4 animate-spin" />} Salvar pontuação</Button>}
          </div>
        </Panel>

        <Panel label="c" title="Classificação por medalhas">
          <div className="grid gap-4">
            {([["gold_min", "🥇 Ouro — a partir de (%)"], ["silver_min", "🥈 Prata — a partir de (%)"], ["bronze_min", "🥉 Bronze — a partir de (%)"]] as const).map(([k, l]) => (
              <Field key={k} label={l}>
                <Input type="number" min={0} max={100} step="0.01" disabled={!editable}
                  value={Number.isFinite(m[k]) ? m[k] : ""} onChange={(e) => setS({ ...s, medals: { ...m, [k]: num(e.target.value) } })} />
              </Field>
            ))}
            <ul className="grid gap-1.5 text-sm">
              <li className="flex justify-between"><span>Ouro</span><span className="text-muted-foreground">{formatPercent(m.gold_min, 2)} a 100%</span></li>
              <li className="flex justify-between"><span>Prata</span><span className="text-muted-foreground">{formatPercent(m.silver_min, 2)} a {upper(m.gold_min)}</span></li>
              <li className="flex justify-between"><span>Bronze</span><span className="text-muted-foreground">{formatPercent(m.bronze_min, 2)} a {upper(m.silver_min)}</span></li>
              <li className="flex justify-between"><span>Sem índice</span><span className="text-muted-foreground">abaixo de {formatPercent(m.bronze_min, 2)}</span></li>
            </ul>
            {editable && <Button className="w-fit" disabled={busy === "medals"} onClick={() => save("medals", m, medalsError)}>
              {busy === "medals" && <Loader2 className="size-4 animate-spin" />} Salvar medalhas</Button>}
          </div>
        </Panel>
      </div>

      <Panel label="d" title="Alertas de prazo">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-64">
            <Field label="Dias antes do vencimento (Próxima do prazo)">
              <Input type="number" min={0} max={60} step="1" disabled={!editable}
                value={Number.isFinite(s.deadline_alert_days) ? s.deadline_alert_days : ""}
                onChange={(e) => setS({ ...s, deadline_alert_days: num(e.target.value) })} />
            </Field>
          </div>
          {editable && (
            <Button disabled={busy === "deadline_alert_days"} onClick={() => save("deadline_alert_days", Math.round(s.deadline_alert_days),
              () => Number.isFinite(s.deadline_alert_days) && s.deadline_alert_days >= 0 && s.deadline_alert_days <= 60 ? null : "Informe entre 0 e 60 dias.")}>
              {busy === "deadline_alert_days" && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          )}
        </div>
      </Panel>
    </>
  );
}
