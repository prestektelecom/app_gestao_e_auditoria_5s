import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const navigate = vi.fn();
const auth = vi.hoisted(() => ({
  login: vi.fn(),
  hasAnyAdmin: vi.fn(),
  bootstrapAdmin: vi.fn(),
  requestPasswordReset: vi.fn(),
}));
const authState = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  loading: false,
}));

// Renderiza só o componente da rota, sem router nem servidor.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => navigate,
}));
vi.mock("@/lib/auth.functions", () => auth);
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ ...authState, refresh: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

async function renderLogin() {
  const { Route } = await import("@/routes/login");
  const LoginPage = (Route as unknown as { options: { component: ComponentType } }).options
    .component;
  const view = render(<LoginPage />);
  await act(async () => {}); // deixa o hasAnyAdmin resolver
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.session = null;
  authState.loading = false;
  auth.hasAnyAdmin.mockResolvedValue(true);
  auth.login.mockResolvedValue({ ok: true });
  auth.requestPasswordReset.mockResolvedValue({ ok: true });
});

describe("Tela de login", () => {
  it("Modo entrar: mostra boas-vindas e os campos de e-mail e senha", async () => {
    await renderLogin();
    expect(screen.getByRole("heading", { name: "Bem-vindo de volta" })).toBeInTheDocument();
    expect(screen.getByText(/entre com seu e-mail e senha/i)).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  });

  it("Modo recuperar acesso: troca o título e esconde a senha", async () => {
    await renderLogin();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    });
    expect(screen.getByRole("heading", { name: "Recuperar acesso" })).toBeInTheDocument();
    expect(screen.getByText(/enviaremos um link/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  });

  it("Modo primeiro administrador: mostra o nome antes do e-mail", async () => {
    auth.hasAnyAdmin.mockResolvedValue(false);
    await renderLogin();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /primeiro acesso/i }));
    });
    expect(
      screen.getByRole("heading", { name: "Criar primeiro administrador" }),
    ).toBeInTheDocument();
    const name = screen.getByLabelText("Nome completo");
    const email = screen.getByLabelText("E-mail");
    expect(name.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Troca de modo mantém o e-mail digitado e foca o primeiro campo", async () => {
    await renderLogin();
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "a@b.com" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    });
    const email = screen.getByLabelText("E-mail");
    expect(email).toHaveValue("a@b.com");
    expect(email).toHaveFocus();
  });

  it("Admin já existe: não oferece criar administrador", async () => {
    await renderLogin();
    expect(screen.queryByRole("button", { name: /primeiro acesso/i })).not.toBeInTheDocument();
  });

  it("Já logado: vai para o painel", async () => {
    authState.session = { user: { id: "1", email: "a@b.c" } };
    await renderLogin();
    expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" });
  });

  it("Ícones visíveis: cada campo tem ícone decorativo e rótulo", async () => {
    await renderLogin();
    for (const label of ["E-mail", "Senha"]) {
      const input = screen.getByLabelText(label);
      expect(input.parentElement?.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("Mostrar e ocultar senha", async () => {
    await renderLogin();
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    });
    expect(input).toHaveAttribute("type", "text");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }));
    });
    expect(input).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Mostrar senha" })).toBeInTheDocument();
  });

  it("Senha errada: erro aparece no formulário e some quando o usuário corrige", async () => {
    auth.login.mockRejectedValue(new Error("E-mail ou senha inválidos."));
    await renderLogin();
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "errada" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha inválidos.");
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "errada2" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Enviando login: botão desativado com texto de progresso e sem envio duplicado", async () => {
    let finish!: () => void;
    auth.login.mockReturnValue(
      new Promise<void>((r) => {
        finish = r;
      }),
    );
    await renderLogin();
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "certa123" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    });
    const busy = screen.getByRole("button", { name: /entrando/i });
    expect(busy).toBeDisabled();
    await act(async () => {
      fireEvent.click(busy);
    });
    expect(auth.login).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" }));
  });
});
