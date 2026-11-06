import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { bootstrapAdmin, hasAnyAdmin, login, requestPasswordReset } from "@/lib/auth.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import logoPrestek from "@/assets/logo-prestek.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Prestek 5S" },
      { name: "description", content: "Acesso ao Sistema de Gestão e Auditoria 5S da Prestek." },
      { property: "og:title", content: "Entrar — Prestek 5S" },
      { property: "og:description", content: "Acesso ao Sistema de Gestão e Auditoria 5S da Prestek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  component: LoginPage,
});

type Mode = "login" | "forgot" | "bootstrap";

function LoginPage() {
  const { session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [hasAdmin, setHasAdmin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  useEffect(() => {
    document.getElementById(mode === "bootstrap" ? "name" : "email")?.focus();
  }, [mode]);

  useEffect(() => {
    hasAnyAdmin().then((v) => setHasAdmin(v !== false)).catch(() => setHasAdmin(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        try {
          await login({ data: { email: email.trim(), password } });
        } catch (err) {
          toast.error((err as Error).message || "E-mail ou senha inválidos.");
          return;
        }
        await refresh();
        navigate({ to: "/dashboard" });
      } else if (mode === "forgot") {
        await requestPasswordReset({ data: { email: email.trim() } });
        toast.success("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
        setMode("login");
      } else {
        if (password.length < 8) { toast.error("A senha deve ter ao menos 8 caracteres."); return; }
        await bootstrapAdmin({ data: { name: name.trim(), email: email.trim(), password } });
        toast.success("Administrador criado.");
        await refresh();
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-theme grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <section className="reference-login-brand hidden flex-col justify-between p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-md bg-card p-1">
            <img src={logoPrestek} alt="Prestek Telecom" className="size-full object-contain" />
          </div>
          <span className="font-display text-lg font-semibold">Prestek Telecom</span>
        </div>
        <div>
          <h1 className="font-display text-4xl font-semibold leading-tight text-brand-orange">Prestek 5S</h1>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">Sistema de Gestão e Auditoria 5S</p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">© 2026 Prestek Telecom</p>
      </section>
      <div className="flex items-center justify-center p-6 sm:p-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <div className="grid size-10 place-items-center rounded-md border bg-card p-1">
            <img src={logoPrestek} alt="Prestek Telecom" className="size-full object-contain" />
          </div>
          <span className="font-display text-lg font-semibold text-brand-orange">Prestek 5S</span>
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {mode === "login" ? "Entrar" : mode === "forgot" ? "Recuperar acesso" : "Criar primeiro administrador"}
        </h2>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          {mode === "bootstrap" && (
            <div className="grid gap-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "forgot" && (
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <Button type="submit" disabled={busy} className="mt-1">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === "login" ? "Entrar" : mode === "forgot" ? "Enviar link" : "Criar administrador"}
          </Button>
        </form>
        <div className="mt-5 flex flex-col gap-2 text-sm">
          {mode === "login" ? (
            <Button variant="link" className="h-auto justify-start p-0" onClick={() => setMode("forgot")}>Esqueci minha senha</Button>
          ) : (
            <Button variant="link" className="h-auto justify-start p-0" onClick={() => setMode("login")}>Voltar para o login</Button>
          )}
          {!hasAdmin && mode === "login" && (
            <Button variant="link" className="h-auto justify-start whitespace-normal p-0 text-left text-muted-foreground" onClick={() => setMode("bootstrap")}>
              Primeiro acesso? Criar administrador do sistema
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
