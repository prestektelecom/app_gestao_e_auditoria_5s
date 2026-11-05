import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/middleware";

const roleSchema = z.enum(["admin", "auditor", "manager", "director"]);

export const NOT_ADMIN = "Somente administradores podem gerenciar usuários.";
export const EMAIL_IN_USE = "Este e-mail já está em uso.";
export const SELF_LOCKOUT = "Você não pode remover seu próprio acesso de administrador.";

const createSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(255),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(72),
  role: roleSchema,
  system_access: z.boolean(),
  active: z.boolean(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(255),
  role: roleSchema,
  system_access: z.boolean(),
  active: z.boolean(),
  password: z.string().min(8).max(72).optional(),
});

export type CreateUserInput = z.infer<typeof createSchema>;
export type UpdateUserInput = z.infer<typeof updateSchema>;

/** Regras de criação, separadas da server function para poderem ser testadas. */
export async function createUserAs(actorId: string, input: CreateUserInput) {
  const data = { ...input, email: input.email.trim().toLowerCase() };
  const { asService, rpc } = await import("@/server/db.server");
  const { hashPassword } = await import("@/server/auth.server");
  const hash = await hashPassword(data.password);
  return asService(async (tx) => {
    if (!(await rpc(tx, "is_admin", { _user_id: actorId }))) throw new Error(NOT_ADMIN);
    const [dup] = await tx`select 1 from public.profiles where lower(email) = ${data.email}
                           union select 1 from auth.users where lower(email) = ${data.email}`;
    if (dup) throw new Error(EMAIL_IN_USE);
    const [u] = await tx<{ id: string }[]>`
      insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at, banned_until)
      values (${data.email}, ${hash}, ${tx.json({ name: data.name })}, now(),
              ${data.active && data.system_access ? null : "infinity"})
      returning id`;
    const id = u!.id;
    // O trigger handle_new_user criou o perfil e um papel padrão; aplica os valores escolhidos.
    await tx`update public.profiles set name = ${data.name}, system_access = ${data.system_access}, active = ${data.active} where id = ${id}`;
    await tx`insert into public.user_roles (user_id, role) values (${id}, ${data.role})
             on conflict (user_id) do update set role = excluded.role`;
    return { id };
  });
}

export async function updateUserAs(actorId: string, input: UpdateUserInput) {
  const data = { ...input, email: input.email.trim().toLowerCase() };
  const { asService, rpc } = await import("@/server/db.server");
  const { hashPassword, deleteUserSessions } = await import("@/server/auth.server");
  const hash = data.password ? await hashPassword(data.password) : null;
  return asService(async (tx) => {
    if (!(await rpc(tx, "is_admin", { _user_id: actorId }))) throw new Error(NOT_ADMIN);
    if (data.id === actorId && (!data.active || !data.system_access || data.role !== "admin")) throw new Error(SELF_LOCKOUT);
    const [dup] = await tx`select 1 from public.profiles where lower(email) = ${data.email} and id <> ${data.id}
                           union select 1 from auth.users where lower(email) = ${data.email} and id <> ${data.id}`;
    if (dup) throw new Error(EMAIL_IN_USE);
    const canSignIn = data.active && data.system_access;
    const updated = await tx`
      update auth.users set email = ${data.email},
        raw_user_meta_data = raw_user_meta_data || ${tx.json({ name: data.name })},
        banned_until = ${canSignIn ? null : "infinity"},
        encrypted_password = coalesce(${hash}, encrypted_password),
        updated_at = now()
      where id = ${data.id}`;
    if (updated.count === 0) throw new Error("Usuário não encontrado.");
    await tx`update public.profiles set name = ${data.name}, email = ${data.email},
               system_access = ${data.system_access}, active = ${data.active} where id = ${data.id}`;
    await tx`insert into public.user_roles (user_id, role) values (${data.id}, ${data.role})
             on conflict (user_id) do update set role = excluded.role`;
    // Inativado, sem acesso ou com senha trocada pelo admin: encerra as sessões abertas.
    if (!canSignIn || hash) await deleteUserSessions(tx, data.id);
    return { ok: true };
  });
}

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => createSchema.parse(d))
  .handler(({ data, context }) => createUserAs(context.userId, data));

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => updateSchema.parse(d))
  .handler(({ data, context }) => updateUserAs(context.userId, data));
