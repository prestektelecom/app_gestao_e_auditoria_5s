import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ path: "/dashboard", role: "admin" as string }));

// Link vira <a> simples e o caminho atual é controlado pelo teste.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, onClick, ...rest }: { to: string; children: ReactNode; onClick?: () => void }) => (
    <a href={to} {...rest} onClick={(e) => { e.preventDefault(); onClick?.(); }}>{children}</a>
  ),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: state.path } }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ role: state.role }) }));
vi.mock("@/components/app/notifications", () => ({ NotificationBell: () => null }));

const { NavLinks } = await import("@/components/app/shell");

const activeLinks = () =>
  screen.getAllByRole("link").filter((a) => a.hasAttribute("data-active")).map((a) => a.textContent);

beforeEach(() => {
  state.path = "/dashboard";
  state.role = "admin";
});

describe("menu lateral aberto", () => {
  it("mostra os títulos das seções e não mostra o rótulo genérico 'Menu'", () => {
    render(<NavLinks />);
    for (const t of ["Auditoria 5S", "Reuniões", "Manutenção", "Cadastros", "Administração"]) {
      expect(screen.getByRole("group", { name: t })).toBeInTheDocument();
    }
    expect(screen.queryByText("Menu")).not.toBeInTheDocument();
  });

  it("itens de Reuniões aparecem sem clique e sem pastas", () => {
    state.path = "/auditorias";
    render(<NavLinks />);
    const reunioes = screen.getByRole("group", { name: "Reuniões" });
    expect(within(reunioes).getByRole("link", { name: "Atas" })).toBeInTheDocument();
    expect(within(reunioes).getByRole("link", { name: "Plano de Ação da reunião" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("detalhe de auditoria destaca só Auditorias", () => {
    state.path = "/auditorias/123";
    render(<NavLinks />);
    expect(activeLinks()).toEqual(["Auditorias"]);
  });

  it("Plano de Ação da reunião não destaca o Plano de Ação do 5S", () => {
    state.path = "/reunioes/plano-de-acao";
    render(<NavLinks />);
    expect(activeLinks()).toEqual(["Plano de Ação da reunião"]);
  });

  it("gestor não vê a seção Administração", () => {
    state.role = "manager";
    render(<NavLinks />);
    expect(screen.queryByRole("group", { name: "Administração" })).not.toBeInTheDocument();
  });

  it("clicar em um item chama onNavigate (fecha a gaveta no celular)", () => {
    const onNavigate = vi.fn();
    render(<NavLinks onNavigate={onNavigate} />);
    const notas = screen.getByRole("link", { name: "Notas" });
    expect(notas).toHaveAttribute("href", "/manutencao/notas");
    fireEvent.click(notas);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("menu lateral recolhido", () => {
  it("troca títulos por separadores e mostra o nome completo no ícone", () => {
    render(<NavLinks compact />);
    expect(screen.queryByText("Manutenção")).not.toBeInTheDocument();
    const painel = screen.getByRole("link", { name: "Manutenção · Painel" });
    expect(painel).toHaveAttribute("title", "Manutenção · Painel");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("title", "Dashboard");
  });
});
