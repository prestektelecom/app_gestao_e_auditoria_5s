import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, type UserContext } from "./middleware";
import { rows, userTx } from "./server-fn";

// Notificações internas: geradas sob demanda por refresh_my_notifications() e lidas
// pelo próprio usuário (RLS limita às notificações dele).
export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export const notificationLogic = {
  async list(ctx: UserContext) {
    const { rpc } = await import("@/server/db.server");
    return userTx(ctx, async (tx) => {
      await rpc(tx, "refresh_my_notifications");
      return rows(
        await tx<NotificationRow[]>`
          select id, type, title, message, link, read_at, created_at
          from public.notifications order by created_at desc limit 300`,
      );
    });
  },
  markRead: (ctx: UserContext, id: string) =>
    userTx(ctx, async (tx) => {
      await tx`update public.notifications set read_at = now() where id = ${id} and read_at is null`;
      return { ok: true };
    }),
  markAll: (ctx: UserContext) =>
    userTx(ctx, async (tx) => {
      await tx`update public.notifications set read_at = now() where read_at is null`;
      return { ok: true };
    }),
};

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) => notificationLogic.list(context));

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => notificationLogic.markRead(context, data.id));

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(({ context }) => notificationLogic.markAll(context));
