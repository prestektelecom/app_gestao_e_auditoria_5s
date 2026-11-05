// Acesso ao PostgreSQL (design D2).
//
// Toda consulta roda dentro de uma transação que diz ao banco QUEM está pedindo,
// para as regras RLS e os grants das migrations valerem como no sistema antigo:
//
//   asUser(userId, fn) -> papel "authenticated", auth.uid() = userId
//   asAnon(fn)         -> papel "anon" (fluxo público de QR), auth.uid() = null
//   asService(fn)      -> dono das tabelas, sem RLS (só para código do servidor)
//
// SET LOCAL / set_config(..., true) valem só dentro da transação, então uma conexão
// do pool nunca leva a identidade de uma requisição para a próxima.
import postgres from "postgres";
import { getEnv } from "./env.server";
import type { FnArgs, FnReturns, Database } from "./db-types";
import { toUserError } from "./errors.server";

export type Tx = postgres.TransactionSql<Record<string, never>>;
export type Sql = postgres.Sql<Record<string, never>>;

/** Dados da requisição que as funções SQL usam (ex.: request_ip() no limite de tentativas do QR). */
export type RequestInfo = { ip?: string | null };

// Formatos iguais aos que o PostgREST devolvia, para as telas não mudarem:
// datas/horários como texto ISO, numeric e bigint como number.
const isoTimestamp = (v: string) => {
  // "2026-10-15 13:14:45.37595+00" -> "2026-10-15T13:14:45.37595+00:00"
  const s = v.replace(" ", "T");
  return /[+-]\d\d$/.test(s) ? `${s}:00` : s;
};
const types = {
  timestamptz: {
    to: 1184,
    from: [1184],
    serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
    parse: isoTimestamp,
  },
  timestamp: { to: 1114, from: [1114], serialize: (x: unknown) => String(x), parse: (v: string) => v.replace(" ", "T") },
  date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (v: string) => v },
  numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (v: string) => Number(v) },
  int8: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (v: string) => Number(v) },
};

export function createSql(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    onnotice: () => {},
    connection: { TimeZone: "UTC", application_name: "gestao-5s" },
    types,
  }) as unknown as Sql;
}

let pool: Sql | undefined;

/** Pool único do processo. */
export function getSql(): Sql {
  pool ??= createSql(getEnv().DATABASE_URL);
  return pool;
}

/** Só para testes: troca o pool usado pelos helpers. */
export function setSqlForTests(sql: Sql | undefined) {
  pool = sql;
}

async function setRequestHeaders(tx: Tx, req?: RequestInfo) {
  const headers = req?.ip ? JSON.stringify({ "x-forwarded-for": req.ip }) : "";
  await tx`select set_config('request.headers', ${headers}, true)`;
}

/** Erros do Postgres saem como mensagens em português (detalhe só no log). */
function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (getSql().begin((tx) => fn(tx as Tx)) as Promise<T>).catch((e) => {
    throw toUserError(e);
  });
}

export function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>, req?: RequestInfo): Promise<T> {
  return run(async (tx) => {
    await tx.unsafe("set local role authenticated");
    await tx`select set_config('request.jwt.claim.sub', ${userId}, true),
                    set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await setRequestHeaders(tx, req);
    return fn(tx);
  });
}

export function asAnon<T>(fn: (tx: Tx) => Promise<T>, req?: RequestInfo): Promise<T> {
  return run(async (tx) => {
    await tx.unsafe("set local role anon");
    await tx`select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)`;
    await setRequestHeaders(tx, req);
    return fn(tx);
  });
}

export function asService<T>(fn: (tx: Tx) => Promise<T>, req?: RequestInfo): Promise<T> {
  return run(async (tx) => {
    await setRequestHeaders(tx, req);
    return fn(tx);
  });
}

// ---------------------------------------------------------------------------
// Chamada de funções SQL (as antigas RPCs), com argumentos nomeados como o PostgREST.
// ---------------------------------------------------------------------------
type FnName = keyof Database["public"]["Functions"];
const IDENT = /^[a-z_][a-z0-9_]*$/;

function callSql(tx: Tx, name: string, args: Record<string, unknown>, mode: "scalar" | "rows") {
  if (!IDENT.test(name)) throw new Error(`Nome de função inválido: ${name}`);
  const keys = Object.keys(args).filter((k) => args[k] !== undefined);
  for (const k of keys) if (!IDENT.test(k)) throw new Error(`Argumento inválido: ${k}`);
  const params = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  const call = `public.${name}(${params})`;
  const text = mode === "scalar" ? `select ${call} as result` : `select * from ${call}`;
  const values = keys.map((k) => {
    const v = args[k];
    // Objetos vão como jsonb de verdade (tx.json); arrays simples (uuid[], text[]) como array.
    return v !== null && typeof v === "object" && !Array.isArray(v) ? tx.json(v as postgres.JSONValue) : v;
  });
  return tx.unsafe(text, values as postgres.ParameterOrJSON<never>[]);
}

/** Função que devolve um valor (boolean, json, uuid, void...). */
export async function rpc<F extends FnName>(tx: Tx, name: F, args: FnArgs<F> = {} as FnArgs<F>): Promise<FnReturns<F>> {
  const rows = await callSql(tx, name, args as Record<string, unknown>, "scalar");
  return (rows[0] as { result: FnReturns<F> } | undefined)?.result as FnReturns<F>;
}

/** Função que devolve linhas (RETURNS TABLE / SETOF). */
export async function rpcRows<F extends FnName>(tx: Tx, name: F, args: FnArgs<F> = {} as FnArgs<F>): Promise<FnReturns<F>> {
  const rows = await callSql(tx, name, args as Record<string, unknown>, "rows");
  return [...rows] as unknown as FnReturns<F>;
}
