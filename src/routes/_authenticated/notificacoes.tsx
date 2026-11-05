import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { EmptyState, LoadingBlock, PageHeader, Panel } from "@/components/app/kit";
import { NotificationItem, notificationsQuery, TYPE_LABEL, useNotificationActions } from "@/components/app/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações — Prestek 5S" },
      { name: "description", content: "Central de notificações internas do Programa 5S." },
      { property: "og:title", content: "Notificações — Prestek 5S" },
      { property: "og:description", content: "Central de notificações internas do Programa 5S." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const q = useQuery(notificationsQuery);
  const { markAll } = useNotificationActions();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const list = (q.data ?? []).filter((n) => tab === "all" || !n.read_at);
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader title="Notificações" subtitle="Central de avisos" actions={unread > 0 && <Button variant="outline" onClick={markAll}><CheckCheck className="size-4" /> Marcar todas como lidas</Button>} />
      <div className="flex gap-2">
        {([["all", "Todas"], ["unread", `Não lidas (${unread})`]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3 py-1.5 text-sm", tab === k ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-foreground/5")}>{l}</button>
        ))}
      </div>
      <Panel>
        {q.isLoading ? <LoadingBlock /> : !list.length ? <EmptyState title="Nenhuma notificação." description="Avisos sobre ações, prazos e setores pendentes aparecerão aqui." />
          : <ul className="grid gap-1">{list.map((n) => <NotificationItem key={n.id} n={n} />)}</ul>}
        <p className="mt-4 text-xs text-muted-foreground">Tipos: {Object.values(TYPE_LABEL).join(" · ")}</p>
      </Panel>
    </>
  );
}
