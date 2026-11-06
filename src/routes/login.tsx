import { useEffect, useState, type ComponentProps, type ComponentType } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, TriangleAlert, User } from "lucide-react";
import { toast } from "sonner";
import { bootstrapAdmin, hasAnyAdmin, login, requestPasswordReset } from "@/lib/auth.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import logoBranco from "@/assets/logo-prestek-branco.png";
import logoHorizontal from "@/assets/logo-prestek-horizontal.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar - Prestek 5S" },
      { name: "description", content: "Acesso ao Sistema de Gestão e Auditoria 5S da Prestek." },
      { property: "og:title", content: "Entrar - Prestek 5S" },
      {
        property: "og:description",
        content: "Acesso ao Sistema de Gestão e Auditoria 5S da Prestek.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  component: LoginPage,
});

type Mode = "login" | "forgot" | "bootstrap";

const COPY: Record<
  Mode,
  { eyebrow: string; title: string; subtitle: string; cta: string; busy: string }
> = {
  login: {
    eyebrow: "Acesso ao sistema",
    title: "Bem-vindo de volta",
    subtitle: "Entre com seu e-mail e senha para continuar.",
    cta: "Entrar",
    busy: "Entrando…",
  },
  forgot: {
    eyebrow: "Recuperação de senha",
    title: "Recuperar acesso",
    subtitle: "Informe seu e-mail e enviaremos um link para definir uma nova senha.",
    cta: "Enviar link",
    busy: "Enviando…",
  },
  bootstrap: {
    eyebrow: "Primeiro acesso",
    title: "Criar primeiro administrador",
    subtitle: "Esta conta terá acesso total ao sistema.",
    cta: "Criar administrador",
    busy: "Criando…",
  },
};

const SENSES = [
  { jp: "Seiri", pt: "Utilização" },
  { jp: "Seiton", pt: "Organização" },
  { jp: "Seiso", pt: "Limpeza" },
  { jp: "Seiketsu", pt: "Padronização" },
  { jp: "Shitsuke", pt: "Disciplina" },
];

/** Atraso da entrada em sequência (classe `rise`). */
const step = (i: number) => ({ animationDelay: `${i * 60}ms` });

function LoginPage() {
  const { session, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [hasAdmin, setHasAdmin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
    hasAnyAdmin()
      .then((v) => setHasAdmin(v !== false))
      .catch(() => setHasAdmin(true));
  }, []);

  function switchMode(next: Mode) {
    setFormError(null);
    setMode(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "login") {
        try {
          await login({ data: { email: email.trim(), password } });
        } catch (err) {
          const message = (err as Error).message || "E-mail ou senha inválidos.";
          setFormError(message);
          toast.error(message);
          return;
        }
        await refresh();
        navigate({ to: "/dashboard" });
      } else if (mode === "forgot") {
        await requestPasswordReset({ data: { email: email.trim() } });
        toast.success(
          "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.",
        );
        switchMode("login");
      } else {
        if (password.length < 8) {
          toast.error("A senha deve ter ao menos 8 caracteres.");
          return;
        }
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

  const copy = COPY[mode];

  return (
    <div className="management-theme grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <BrandPanel />
      <div className="app-backdrop flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          <div className="rise mb-6 flex flex-col items-center gap-2 lg:hidden">
            <img src={logoHorizontal} alt="Prestek Telecom" className="h-11 w-auto" />
            <span className="font-display text-sm font-semibold text-brand-orange">
              Gestão e Auditoria 5S
            </span>
          </div>

          <div className="panel p-5 sm:p-7">
            <div key={mode}>
              <p className="eyebrow rise" style={step(0)}>
                {copy.eyebrow}
              </p>
              <h2
                className="rise mt-1.5 font-display text-xl font-semibold tracking-tight sm:text-2xl"
                style={step(1)}
              >
                {copy.title}
              </h2>
              <div className="tape-line mt-3 w-14" style={step(2)} />
              <p className="rise mt-3 text-sm text-muted-foreground" style={step(2)}>
                {copy.subtitle}
              </p>

              <form onSubmit={submit} className="mt-5 grid gap-3.5">
                {mode === "bootstrap" && (
                  <IconField
                    id="name"
                    label="Nome completo"
                    icon={User}
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rise"
                    style={step(3)}
                  />
                )}
                <IconField
                  id="email"
                  label="E-mail"
                  icon={Mail}
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="voce@prestek.com.br"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormError(null);
                  }}
                  className="rise"
                  style={step(mode === "bootstrap" ? 4 : 3)}
                />
                {mode !== "forgot" && (
                  <PasswordField
                    id="password"
                    label="Senha"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setFormError(null);
                    }}
                    className="rise"
                    style={step(mode === "bootstrap" ? 5 : 4)}
                  />
                )}

                {formError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{formError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={busy}
                  className="rise group mt-1 h-10 w-full"
                  style={step(6)}
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden /> {copy.busy}
                    </>
                  ) : (
                    <>
                      {copy.cta}{" "}
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </>
                  )}
                </Button>
              </form>
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t pt-3.5 text-sm">
              {mode === "login" ? (
                <Button
                  variant="link"
                  className="h-auto justify-start p-0"
                  onClick={() => switchMode("forgot")}
                >
                  Esqueci minha senha
                </Button>
              ) : (
                <Button
                  variant="link"
                  className="h-auto justify-start p-0"
                  onClick={() => switchMode("login")}
                >
                  Voltar para o login
                </Button>
              )}
              {!hasAdmin && mode === "login" && (
                <Button
                  variant="link"
                  className="h-auto justify-start whitespace-normal p-0 text-left text-muted-foreground"
                  onClick={() => switchMode("bootstrap")}
                >
                  Primeiro acesso? Criar administrador do sistema
                </Button>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground lg:hidden">
            © 2026 Prestek Telecom
          </p>
        </div>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <section className="reference-login-brand hidden flex-col justify-between p-10 text-sidebar-foreground lg:flex xl:p-12">
      <div className="rise">
        <img src={logoBranco} alt="Prestek Telecom" className="h-12 w-auto xl:h-14" />
      </div>

      <div className="rise" style={step(2)}>
        <h1 className="font-display text-4xl font-semibold leading-tight text-brand-orange xl:text-5xl">
          Prestek 5S
        </h1>
        <div className="tape-line mt-4 w-20" />
        <p className="mt-4 max-w-md text-base text-sidebar-foreground/80">
          Sistema de Gestão e Auditoria 5S
        </p>
        <ol className="mt-8 grid max-w-md gap-2.5">
          {SENSES.map((s, i) => (
            <li key={s.jp} className="rise flex items-baseline gap-4" style={step(4 + i)}>
              <span className="font-mono text-xs text-brand-orange">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-display font-medium">{s.jp}</span>
              <span className="text-sm text-sidebar-foreground/60">{s.pt}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-sidebar-foreground/50">© 2026 Prestek Telecom</p>
    </section>
  );
}

type IconFieldProps = Omit<ComponentProps<typeof Input>, "id"> & {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

function IconField({ id, label, icon: Icon, className, style, ...input }: IconFieldProps) {
  return (
    <div className={cn("grid gap-2", className)} style={style}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input id={id} className="h-10 pl-9" {...input} />
      </div>
    </div>
  );
}

type PasswordFieldProps = Omit<IconFieldProps, "icon" | "type">;

function PasswordField({ id, label, className, style, ...input }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("grid gap-2", className)} style={style}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          type={show ? "text" : "password"}
          required
          className="h-10 pl-9 pr-10"
          {...input}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {show ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
