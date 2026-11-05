import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Wrench } from "lucide-react";
import { maintSectorInfo } from "@/lib/maintenance.functions";
import { MaintenanceForm } from "@/components/app/maintenance-form";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/manutencao/q/$token")({
  head: () => ({
    meta: [
      { title: "Nova Nota de Manutenção — Prestek 5S" },
      { name: "description", content: "Abra uma nota de manutenção para pequenos reparos e serviços 5S do seu setor." },
      { property: "og:title", content: "Nova Nota de Manutenção — Prestek 5S" },
      { property: "og:description", content: "Abra uma nota de manutenção para pequenos reparos e serviços 5S do seu setor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { token } = Route.useParams();
  const [done, setDone] = useState<string | null>(null);
  const info = useQuery({
    queryKey: ["maint-sector", token],
    queryFn: () => maintSectorInfo({ data: { token } }),
  });
  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-lg">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Wrench className="size-5" /></span>
          <div>
            <p className="eyebrow">Prestek 5S · Manutenção</p>
            <h1 className="text-xl font-bold">Nova Nota de Manutenção</h1>
          </div>
        </div>
        <div className="panel p-5">
          {info.isLoading ? (
            <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : !info.data ? (
            <p className="py-8 text-center text-sm text-muted-foreground">QR Code inválido ou setor inativo. Procure o responsável pelo 5S.</p>
          ) : done ? (
            <div className="grid place-items-center gap-3 py-8 text-center">
              <CheckCircle2 className="size-10 text-success" />
              <p className="text-lg font-semibold">Nota {done} enviada!</p>
              <p className="text-sm text-muted-foreground">A equipe responsável foi avisada e vai acompanhar sua solicitação.</p>
              <Button variant="outline" onClick={() => setDone(null)}>Abrir outra nota</Button>
            </div>
          ) : (
            <MaintenanceForm mode={{ kind: "qr", token, unitName: info.data.unit_name, sectorName: info.data.sector_name }} onDone={setDone} />
          )}
        </div>
      </div>
    </div>
  );
}
