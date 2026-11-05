// Dados de teste comuns aos testes de banco.
import bcrypt from "bcryptjs";
import type { Tx } from "@/server/db.server";

export async function makeUser(
  tx: Tx,
  opts: { email: string; name?: string; role?: "admin" | "auditor" | "manager" | "director"; password?: string; active?: boolean; access?: boolean },
) {
  const hash = await bcrypt.hash(opts.password ?? "senha-de-teste-1", 4);
  const [u] = await tx<{ id: string }[]>`
    insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
    values (${opts.email}, ${hash}, ${tx.json({ name: opts.name ?? opts.email })}, now())
    returning id`;
  const id = u!.id;
  await tx`update public.profiles set system_access = ${opts.access ?? true}, active = ${opts.active ?? true} where id = ${id}`;
  await tx`insert into public.user_roles (user_id, role) values (${id}, ${opts.role ?? "auditor"})
           on conflict (user_id) do update set role = excluded.role`;
  return id;
}
