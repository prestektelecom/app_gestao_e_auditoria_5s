import { describe, expect, it, vi } from "vitest";

// Só a estrutura do menu interessa aqui; o resto do shell não roda.
vi.mock("@/lib/auth", () => ({ useAuth: () => ({}) }));
vi.mock("@/components/app/notifications", () => ({ NotificationBell: () => null }));

const { NAV, visibleSections } = await import("@/components/app/shell");

const titles = (role: Parameters<typeof visibleSections>[0]) =>
  visibleSections(role).map((s) => s.title);
const labels = (role: Parameters<typeof visibleSections>[0], title: string) =>
  visibleSections(role).find((s) => s.title === title)?.items.map((i) => i.label);

describe("menu lateral: seções e visibilidade", () => {
  it("admin vê todas as seções na ordem, com Dashboard sozinho no topo", () => {
    const sections = visibleSections("admin");
    expect(sections[0]?.title).toBeUndefined();
    expect(sections[0]?.items.map((i) => i.label)).toEqual(["Dashboard"]);
    expect(titles("admin").slice(1)).toEqual([
      "Auditoria 5S", "Reuniões", "Manutenção", "Cadastros", "Administração",
    ]);
  });

  it("cada seção tem os itens, a ordem e os nomes da spec", () => {
    expect(labels("admin", "Auditoria 5S")).toEqual(["Auditorias", "Plano de Ação", "Relatórios"]);
    expect(labels("admin", "Reuniões")).toEqual(["Atas", "Plano de Ação da reunião"]);
    expect(labels("admin", "Manutenção")).toEqual(["Painel", "Notas", "QR Codes de equipamentos", "Gestão"]);
    expect(labels("admin", "Cadastros")).toEqual(["Unidades e Setores", "Checklist 5S", "QR Codes dos setores"]);
    expect(labels("admin", "Administração")).toEqual(["Usuários e Auditores", "Configurações"]);
  });

  it("não há nomes repetidos para o admin", () => {
    const all = visibleSections("admin").flatMap((s) => s.items.map((i) => i.label));
    expect(new Set(all).size).toBe(all.length);
  });

  it("os endereços continuam os de antes", () => {
    expect(NAV.flatMap((s) => s.items.map((i) => i.to)).sort()).toEqual([
      "/auditorias", "/checklist", "/configuracoes", "/dashboard",
      "/manutencao/dashboard", "/manutencao/gestao", "/manutencao/notas", "/manutencao/qr-codes",
      "/plano-de-acao", "/qr-codes", "/relatorios", "/reunioes/atas", "/reunioes/plano-de-acao",
      "/unidades", "/usuarios",
    ]);
  });

  it("gestor não vê Administração e vê só Unidades em Cadastros", () => {
    expect(titles("manager")).not.toContain("Administração");
    expect(labels("manager", "Cadastros")).toEqual(["Unidades e Setores"]);
  });

  it("auditor vê o Checklist, mas nenhum QR Code", () => {
    expect(labels("auditor", "Cadastros")).toEqual(["Unidades e Setores", "Checklist 5S"]);
    expect(labels("auditor", "Manutenção")).not.toContain("QR Codes de equipamentos");
  });

  it("sem perfil, nenhuma seção aparece", () => {
    expect(visibleSections(null)).toEqual([]);
  });
});
