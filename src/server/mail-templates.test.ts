// @vitest-environment node
import { describe, expect, it } from "vitest";
import { passwordResetEmail } from "./mail-templates";

describe("e-mail de redefinição de senha", () => {
  const base = { link: "https://5s.prestek.com.br/reset-password?token=abc", origin: "https://5s.prestek.com.br", validMinutes: 60 };

  it("tem botão com o link, validade, primeiro nome e versão em texto", () => {
    const m = passwordResetEmail({ ...base, name: "Marcio Eduardo Felix" });
    expect(m.subject).toBe("Redefina sua senha do Prestek 5S");
    expect(m.html).toContain('href="https://5s.prestek.com.br/reset-password?token=abc"');
    expect(m.html).toContain("Definir nova senha");
    expect(m.html).toContain("Olá, Marcio!");
    expect(m.html).toContain("<strong>1 hora</strong>");
    expect(m.html).toContain("https://5s.prestek.com.br/email-logo.png");
    expect(m.text).toContain(base.link);
    expect(m.text).toContain("1 hora");
  });

  it("escapa o nome (sem HTML injetado)", () => {
    const m = passwordResetEmail({ ...base, name: "<b>x</b>" });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("sem nome, só cumprimenta", () => {
    expect(passwordResetEmail({ ...base, name: "  " }).html).toContain("Olá!");
  });
});
