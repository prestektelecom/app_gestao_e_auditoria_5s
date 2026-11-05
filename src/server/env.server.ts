// Configuração do servidor, lida das variáveis de ambiente e validada uma vez.
// Só pode ser importado por código de servidor (*.server.ts ou dentro de handlers).
import { existsSync } from "node:fs";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1).url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa ter ao menos 32 caracteres"),
  STORAGE_DIR: z.string().min(1),
  PUBLIC_ORIGIN: z
    .string()
    .url()
    .transform((v) => v.replace(/\/+$/, "")),
  PORT: z.coerce.number().int().positive().default(3000),
  // true quando o app está atrás de um proxy (nginx, Caddy) que define X-Forwarded-For.
  // Sem proxy, deixe false: senão qualquer um forja o IP e escapa do limite de tentativas.
  TRUST_PROXY: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type ServerEnv = z.infer<typeof schema>;

/** Valida um conjunto de variáveis. Lança um erro que cita cada variável inválida ou ausente. */
export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v === "" ? undefined : v]));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((i) => {
      const name = String(i.path[0]);
      return cleaned[name] === undefined ? `${name} (ausente)` : `${name} (${i.message})`;
    });
    throw new Error(`Configuração inválida do servidor: ${problems.join(", ")}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  // Em desenvolvimento (vite dev) o .env não vai para process.env sozinho.
  if (!process.env["DATABASE_URL"] && existsSync(".env")) process.loadEnvFile(".env");
  cached = parseEnv(process.env);
  return cached;
}

export function smtpConfigured(env: ServerEnv = getEnv()) {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}
