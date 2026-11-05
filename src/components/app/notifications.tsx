import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications.functions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type Notification = { id: string; type: string; title: string; message: string; link: string | null; read_at: string | null; created_at: string };

export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: (): Promise<Notification[]> => listNotifications(),
  refetchInterval: 5 * 60 * 1000,
});

export const TYPE_LABEL: Record<string, string> = {
  NEW_NC: "Nova NC/NCP", OVERDUE: "Ação vencida", DUE_SOON: "Próxima do prazo", PENDING: "Ação pendente", PENDING_AUDIT: "Auditoria pendente", COVERAGE: "Cobertura",
};
const dot = (t: string) => (t === "OVERDUE" || t === "NEW_NC" ? "bg-destructive" : t === "DUE_SOON" || t === "PENDING_AUDIT" || t === "COVERAGE" ? "bg-warning" : "bg-primary");

export function useNotificationActions() {
  const qc = useQueryClient();
  return {
    markRead: async (id: string) => { await markNotificationRead({ data: { id } }); qc.invalidateQueries({ queryKey: ["notifications"] }); },
    markAll: async () => { await markAllNotificationsRead(); qc.invalidateQueries({ queryKey: ["notifications"] }); },
  };
}

export function NotificationItem({ n, onOpen }: { n: Notification; onOpen?: () => void }) {
  const { markRead } = useNotificationActions();
  const navigate = useNavigate();
  return (
    <li className={cn("flex gap-3 rounded-xl p-3 transition hover:bg-foreground/5", !n.read_at && "bg-primary/5")}>
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-muted-foreground/30" : dot(n.type))} />
      <button className="min-w-0 flex-1 text-left" onClick={async () => {
        if (!n.read_at) await markRead(n.id);
        onOpen?.();
        if (n.link) navigate({ to: n.link as never });
      }}>
        <p className="text-sm font-medium">{n.title}</p>
        <p className="text-sm text-muted-foreground">{n.message}</p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{TYPE_LABEL[n.type] ?? n.type} · {formatDateTime(n.created_at)}</p>
      </button>
      {!n.read_at && <button className="h-fit text-xs text-primary hover:underline" onClick={() => markRead(n.id)}>Marcar como lida</button>}
    </li>
  );
}

export function NotificationBell() {
  const q = useQuery(notificationsQuery);
  const { markAll } = useNotificationActions();
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  return (
    <Popover>
      <PopoverTrigger className="relative grid size-9 place-items-center rounded-lg border border-border bg-card/60 transition hover:bg-card" aria-label="Notificações">
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread > 99 ? "99+" : unread}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-2">
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-sm font-semibold">Notificações</p>
          {unread > 0 && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAll}><CheckCheck className="size-3.5" /> Marcar todas como lidas</Button>}
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {(q.data ?? []).slice(0, 8).map((n) => <NotificationItem key={n.id} n={n} />)}
          {!q.isLoading && !q.data?.length && <li className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</li>}
        </ul>
        <Link to="/notificacoes" className="block rounded-lg p-2 text-center text-xs text-primary hover:bg-foreground/5">Ver central de notificações</Link>
      </PopoverContent>
    </Popover>
  );
}
