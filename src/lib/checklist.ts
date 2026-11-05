export const SENSES = [
  { code: "UTILIZACAO", label: "Utilização", jp: "Seiri" },
  { code: "ORGANIZACAO", label: "Organização", jp: "Seiton" },
  { code: "LIMPEZA", label: "Limpeza", jp: "Seiso" },
  { code: "HIGIENE", label: "Higiene/Padronização", jp: "Seiketsu" },
  { code: "DISCIPLINA", label: "Disciplina", jp: "Shitsuke" },
  { code: "COLETA", label: "Coleta Seletiva", jp: "" },
] as const;

export type SenseCode = (typeof SENSES)[number]["code"];

export const senseLabel = (c: string) => SENSES.find((s) => s.code === c)?.label ?? c;
export const senseFull = (c: string) => {
  const s = SENSES.find((x) => x.code === c);
  return s ? (s.jp ? `${s.label} — ${s.jp}` : s.label) : c;
};
export const senseRank = (c: string) => {
  const i = SENSES.findIndex((s) => s.code === c);
  return i < 0 ? 99 : i;
};

export type AnswerValue = "COMPLIANT" | "PARTIALLY_NON_COMPLIANT" | "NON_COMPLIANT" | "NOT_APPLICABLE";

export const ANSWERS: { value: AnswerValue; label: string; short: string }[] = [
  { value: "COMPLIANT", label: "Conforme", short: "C" },
  { value: "PARTIALLY_NON_COMPLIANT", label: "Não Conforme Parcial", short: "NCP" },
  { value: "NON_COMPLIANT", label: "Não Conforme", short: "NC" },
  { value: "NOT_APPLICABLE", label: "Não se Aplica", short: "N/A" },
];
export const answerLabel = (a: string | null) => ANSWERS.find((x) => x.value === a)?.label ?? "Sem resposta";
export const requiresEvidence = (a: string | null) => a === "NON_COMPLIANT" || a === "PARTIALLY_NON_COMPLIANT";

export const CLASSIFICATION: Record<string, { label: string; emoji: string }> = {
  OURO: { label: "Ouro", emoji: "🥇" },
  PRATA: { label: "Prata", emoji: "🥈" },
  BRONZE: { label: "Bronze", emoji: "🥉" },
  SEM_INDICE: { label: "Sem índice", emoji: "" },
};
export const classificationText = (c: string | null | undefined) =>
  c ? `${CLASSIFICATION[c]?.emoji ?? ""} ${CLASSIFICATION[c]?.label ?? c}`.trim() : "—";

export type ScoringSettings = { conforme: number; nc_parcial: number; nao_conforme: number };
export type MedalSettings = { gold_min: number; silver_min: number; bronze_min: number };

/** Preliminary score preview — the final score is always computed by the database. */
export function computeScore(answers: { answer: string | null }[], sc: ScoringSettings, md: MedalSettings) {
  const pct = (a: string | null) =>
    a === "COMPLIANT" ? sc.conforme : a === "PARTIALLY_NON_COMPLIANT" ? sc.nc_parcial : a === "NON_COMPLIANT" ? sc.nao_conforme : null;
  const vals = answers.map((a) => pct(a.answer)).filter((v): v is number => v !== null);
  const score = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  const bronze = Math.max(md.bronze_min, 70);
  const cls = score === null ? "SEM_INDICE" : score >= md.gold_min ? "OURO" : score >= md.silver_min ? "PRATA" : score >= bronze ? "BRONZE" : "SEM_INDICE";
  return { score, classification: cls };
}

export function formatScore(v: number | string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10) + "%";
}

export const LOCATION_LABEL: Record<string, string> = {
  REGISTERED: "Localização registrada",
  DENIED: "Permissão negada",
  UNAVAILABLE: "Localização indisponível",
};
