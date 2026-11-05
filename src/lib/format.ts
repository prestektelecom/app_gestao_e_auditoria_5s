export const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Progressive mask 000.000.000-00 for input fields. */
export function maskCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Listing mask: never reveals the first 6 digits (future audit code). */
export function maskCpfHidden(cpf: string) {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return "***.***.***-**";
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T12:00:00") : new Date(value);
  return dateFmt.format(d);
}
export function formatDateTime(value?: string | null) {
  return value ? dateTimeFmt.format(new Date(value)) : "—";
}
export function formatPercent(n: number, digits = 1) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(n) + "%";
}
export function formatCurrency(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export const UF_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

/** Friendly pt-BR messages for database errors. */
export function friendlyError(error: unknown): string {
  const e = error as { code?: string; message?: string; details?: string } | null;
  const msg = `${e?.message ?? ""} ${e?.details ?? ""}`;
  if (e?.code === "23505") {
    if (msg.includes("cpf")) return "Este CPF já está cadastrado para outro auditor.";
    if (msg.includes("email")) return "Este e-mail já está em uso.";
    if (msg.includes("code")) return "Já existe uma unidade com este código.";
    if (msg.includes("user_id")) return "Este usuário já está vinculado a outro auditor.";
    return "Registro duplicado.";
  }
  if (e?.code === "23503") return "Combinação inválida: o setor não pertence à unidade selecionada.";
  if (e?.code === "23514") {
    if (msg.includes("cpf")) return "CPF inválido.";
    return "Dados inválidos. Verifique os campos.";
  }
  if (e?.code === "42501") return "Você não tem permissão para esta ação.";
  return e?.message || "Ocorreu um erro inesperado.";
}
