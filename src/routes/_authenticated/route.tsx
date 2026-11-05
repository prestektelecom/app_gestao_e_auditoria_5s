import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app/shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, session, profile, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="app-backdrop grid min-h-screen place-items-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!profile || !profile.active || !profile.system_access) {
    return (
      <div className="app-backdrop grid min-h-screen place-items-center p-4">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Acesso indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">Seu usuário está inativo ou sem acesso ao sistema. Procure o administrador.</p>
          <Button className="mt-6" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>Sair</Button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
