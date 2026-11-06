import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { resetPassword } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Prestek 5S" },
      { name: "description", content: "Defina uma nova senha de acesso ao Prestek 5S." },
      { property: "og:title", content: "Redefinir senha — Prestek 5S" },
      { property: "og:description", content: "Defina uma nova senha de acesso ao Prestek 5S." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPage,
});

function ResetPage() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const tooShort = password.length > 0 && password.length < 8;
  const matches = confirm.length > 0 && confirm === password;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= 8 && password.length <= 72 && matches;
  const navigate = useNavigate();
  return (
    <div className="app-backdrop grid min-h-screen place-items-center p-4">
      <form
        className="panel rise grid w-full max-w-md gap-4 p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!token) return toast.error("Link inválido ou expirado. Solicite um novo.");
          if (password.length < 8) return toast.error("A senha deve ter ao menos 8 caracteres.");
          if (password.length > 72) return toast.error("A senha pode ter no máximo 72 caracteres.");
          if (password !== confirm) return toast.error("As senhas não conferem.");
          setBusy(true);
          try {
            await resetPassword({ data: { token, password } });
          } catch {
            return toast.error("Link inválido ou expirado. Solicite um novo.");
          } finally {
            setBusy(false);
          }
          toast.success("Senha atualizada com sucesso. Entre com a nova senha.");
          navigate({ to: "/login" });
        }}
      >
        <h1 className="text-xl font-semibold">Definir nova senha</h1>
        <div className="grid gap-2">
          <Label htmlFor="pw">Nova senha</Label>
          <div className="relative">
            <Input id="pw" type={show ? "text" : "password"} autoComplete="new-password" className="pr-10"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className={tooShort ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>Mínimo de 8 caracteres.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pw2">Confirmar nova senha</Label>
          <Input id="pw2" type={show ? "text" : "password"} autoComplete="new-password" aria-invalid={mismatch}
            className={mismatch ? "border-destructive" : undefined}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && <p className="text-xs text-destructive" role="alert">As senhas não conferem.</p>}
          {matches && <p className="flex items-center gap-1 text-xs text-success"><Check className="size-3.5" /> As senhas conferem.</p>}
        </div>
        <Button disabled={busy || !ready}>Salvar senha</Button>
      </form>
    </div>
  );
}
