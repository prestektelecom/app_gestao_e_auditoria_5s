import { deadlineOf, downloadCsv, PLAN_STATUS, type ActionPlan } from "./analytics";
import { senseLabel } from "./checklist";
import { formatCurrency, formatDate } from "./format";

export function exportPlans(list: ActionPlan[], alert: number) {
  downloadCsv("plano-de-acao-5w2h", ["Status", "Situação do prazo", "Auditoria", "Data auditoria", "Unidade", "Setor", "Senso", "Tipo", "Pergunta", "Ocorrência", "O quê", "Por quê", "Onde", "Quem", "Quando", "Como", "Quanto", "Origem alterada"],
    list.map((p) => [PLAN_STATUS[p.status], deadlineOf(p, alert).label, p.audits?.audit_number, formatDate(p.audits?.finished_at), p.unit_name, p.sector_name, senseLabel(p.sense), p.nc_type, p.question, p.occurrence,
      p.what, p.why, p.where_text, p.who, formatDate(p.when_date), p.how, p.how_much === null ? "" : formatCurrency(p.how_much), p.origin_changed ? "Sim" : "Não"]));
}
