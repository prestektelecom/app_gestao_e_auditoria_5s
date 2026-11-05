import { describe, expect, it } from "vitest";
import { ataPdfFileName } from "@/lib/ata-pdf";

// O PDF salvo precisa sair com o nome da ata e a data da reunião — nunca com o
// nome da aba do navegador ("Gestão e Auditoria 5S _ Lovable").
describe("Nome do arquivo PDF da ata", () => {
  it("traz o título da ata e a data da reunião", () => {
    expect(ataPdfFileName("2026-10-22")).toBe("Ata de Reunião - Comitê 5S - 22-10-2026.pdf");
  });

  it("não quebra quando a ata ainda não tem data", () => {
    expect(ataPdfFileName(null)).toBe("Ata de Reunião - Comitê 5S.pdf");
  });
});
