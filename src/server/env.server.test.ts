// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.server";

const ok = {
  DATABASE_URL: "postgres://app@localhost:5432/app",
  SESSION_SECRET: "x".repeat(32),
  STORAGE_DIR: "/var/lib/app/files",
  PUBLIC_ORIGIN: "https://5s.exemplo.com.br/",
};

describe("parseEnv", () => {
  it("aceita a configuração mínima e aplica os padrões", () => {
    const env = parseEnv(ok);
    expect(env.PORT).toBe(3000);
    expect(env.PUBLIC_ORIGIN).toBe("https://5s.exemplo.com.br");
    expect(env.SMTP_SECURE).toBe(false);
  });

  it.each(["DATABASE_URL", "SESSION_SECRET", "STORAGE_DIR", "PUBLIC_ORIGIN"])("cita %s quando ausente", (name) => {
    expect(() => parseEnv({ ...ok, [name]: undefined })).toThrow(new RegExp(`${name} \\(ausente\\)`));
  });

  it("trata variável vazia como ausente", () => {
    expect(() => parseEnv({ ...ok, STORAGE_DIR: "" })).toThrow(/STORAGE_DIR \(ausente\)/);
  });

  it("recusa SESSION_SECRET curto", () => {
    expect(() => parseEnv({ ...ok, SESSION_SECRET: "curto" })).toThrow(/SESSION_SECRET \(SESSION_SECRET precisa ter ao menos 32/);
  });
});
