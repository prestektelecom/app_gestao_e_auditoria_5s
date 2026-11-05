// Erros do Postgres -> mensagens em português para o usuário (spec data-access).
// O detalhe técnico (SQL, tabela, constraint) fica só no log do servidor.

type PgError = { code?: string; message?: string; detail?: string; constraint_name?: string; severity?: string };

export function isPgError(e: unknown): e is PgError {
  return typeof e === "object" && e !== null && "code" in e && "severity" in e;
}

/** Mesmas mensagens que src/lib/format.ts#friendlyError já mostrava antes da migração. */
export function pgUserMessage(e: PgError): string {
  const msg = `${e.message ?? ""} ${e.detail ?? ""} ${e.constraint_name ?? ""}`;
  switch (e.code) {
    case "23505":
      if (msg.includes("cpf")) return "Este CPF já está cadastrado para outro auditor.";
      if (msg.includes("email")) return "Este e-mail já está em uso.";
      if (msg.includes("code")) return "Já existe uma unidade com este código.";
      if (msg.includes("user_id")) return "Este usuário já está vinculado a outro auditor.";
      return "Registro duplicado.";
    case "23503":
      return "Combinação inválida: o setor não pertence à unidade selecionada.";
    case "23514":
      return msg.includes("cpf") ? "CPF inválido." : "Dados inválidos. Verifique os campos.";
    case "23502":
      return "Preencha os campos obrigatórios.";
    case "22P02":
    case "22007":
    case "22008":
      return "Dados inválidos. Verifique os campos.";
    case "42501":
      return "Você não tem permissão para esta ação.";
    case "P0001":
      // RAISE EXCEPTION das funções SQL: as mensagens já são escritas para o usuário.
      return e.message || "Não foi possível concluir.";
    default:
      return "Ocorreu um erro inesperado.";
  }
}

/** Converte um erro do Postgres em Error com mensagem amigável; outros erros passam como estão. */
export function toUserError(e: unknown): unknown {
  if (!isPgError(e)) return e;
  if (e.code !== "P0001") console.error("[banco]", e.code, e.message, e.detail ?? "");
  const err = new Error(pgUserMessage(e));
  (err as Error & { code?: string }).code = e.code;
  return err;
}
