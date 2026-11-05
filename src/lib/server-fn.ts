// Atalhos para as server functions (*.functions.ts).
//
// Os módulos de src/server/ não podem ser importados no topo destes arquivos, que
// também vão para o navegador: o import fica dentro do handler, que o compilador
// do TanStack Start remove do bundle do cliente.
import type { UserContext } from "./middleware";

export const db = () => import("@/server/db.server");

/** Roda fn como o usuário logado (RLS e grants valem), passando o IP para o banco. */
export async function userTx<T>(ctx: UserContext, fn: (tx: import("@/server/db.server").Tx) => Promise<T>) {
  const { asUser } = await db();
  return asUser(ctx.userId, fn, { ip: ctx.ip });
}

/** Lança "sem permissão" quando um UPDATE/DELETE não alcançou nenhuma linha (RLS recusou ou id inexistente). */
export function assertTouched(result: { count: number }, message = "Você não tem permissão para esta ação.") {
  if (result.count === 0) throw new Error(message);
}

/** RowList do driver -> array simples (serializa sem propriedades extras). */
export const rows = <T>(r: readonly T[]): T[] => [...r];
