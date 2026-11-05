import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
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
  const [busy, setBusy] = useState(false);
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
          <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button disabled={busy}>Salvar senha</Button>
      </form>
    </div>
  );
}
