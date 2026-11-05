// Cadastros: unidades, setores, usuários, auditores, contadores do painel e parâmetros.
// Substitui as consultas que src/lib/queries.ts e os formulários faziam direto ao banco.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./middleware";
import { assertTouched, rows, userTx } from "./server-fn";
import type { Auditor, Sector, Unit, UserRow } from "./queries";
import type { Json } from "@/server/db-types";

const uuid = z.string().uuid();

export const listUnits = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx<Unit[]>`
          select u.id, u.name, u.code, u.address, u.city, u.state, u.active, u.created_at, u.updated_at,
                 (select count(*) from public.sectors s where s.unit_id = u.id)::int as sector_count
          from public.units u order by u.name`,
      ),
    ),
  );

export const listSectors = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(await tx<Sector[]>`select id, unit_id, name, description, active, created_at, updated_at from public.sectors order by name`),
    ),
  );

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx<UserRow[]>`
          select p.id, p.name, p.email, p.system_access, p.active, p.created_at, p.updated_at, r.role
          from public.profiles p left join public.user_roles r on r.user_id = p.id
          order by p.name`,
      ),
    ),
  );

export const listAuditors = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(
        await tx<Auditor[]>`
          select id, user_id, name, cpf, admission_date, job_title, unit_id, sector_id, authorized, active, created_at, updated_at
          from public.auditors order by name`,
      ),
    ),
  );

export const dashboardCounts = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const { rpc } = await import("@/server/db.server");
    return userTx(context, (tx) => rpc(tx, "dashboard_counts")) as Promise<{ units: number; sectors: number; auditors: number; users: number } | null>;
  });

export const listSettings = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) => rows(await tx<{ key: string; value: Json }[]>`select key, value from public.settings`)),
  );

// ---------------------------------------------------------------------------
// Unidades e setores
// ---------------------------------------------------------------------------
const unitSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).nullable(),
  address: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(2).nullable(),
  active: z.boolean(),
});

export const saveUnit = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => unitSchema.parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      const { id, ...v } = data;
      if (id) {
        assertTouched(await tx`update public.units set ${tx(v, "name", "code", "address", "city", "state", "active")} where id = ${id}`);
      } else {
        await tx`insert into public.units ${tx(v, "name", "code", "address", "city", "state", "active")}`;
      }
      return { ok: true };
    }),
  );

const sectorSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  unit_id: uuid,
  description: z.string().trim().max(500).nullable(),
  active: z.boolean(),
});

export const saveSector = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => sectorSchema.parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      const { id, ...v } = data;
      if (id) {
        assertTouched(await tx`update public.sectors set ${tx(v, "name", "unit_id", "description", "active")} where id = ${id}`);
      } else {
        await tx`insert into public.sectors ${tx(v, "name", "unit_id", "description", "active")}`;
      }
      return { ok: true };
    }),
  );

export const setActive = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ table: z.enum(["units", "sectors", "auditors"]), id: uuid, active: z.boolean() }).parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      // Nome da tabela vem de um enum fechado, nunca do texto do usuário.
      assertTouched(await tx`update ${tx("public." + data.table)} set active = ${data.active} where id = ${data.id}`);
      return { ok: true };
    }),
  );

// ---------------------------------------------------------------------------
// Auditores
// ---------------------------------------------------------------------------
const auditorSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(120),
  cpf: z.string().regex(/^\d{11}$/),
  admission_date: z.string().nullable(),
  job_title: z.string().trim().max(120).nullable(),
  unit_id: uuid,
  sector_id: uuid,
  user_id: uuid.nullable(),
  authorized: z.boolean(),
  active: z.boolean(),
});
const AUDITOR_FIELDS = ["name", "cpf", "admission_date", "job_title", "unit_id", "sector_id", "user_id", "authorized", "active"] as const;

export const saveAuditor = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => auditorSchema.parse(d))
  .handler(({ data, context }) =>
    userTx(context, async (tx) => {
      const { id, ...v } = data;
      const res = id
        ? await tx<Auditor[]>`update public.auditors set ${tx(v, ...AUDITOR_FIELDS)} where id = ${id}
             returning id, user_id, name, cpf, admission_date, job_title, unit_id, sector_id, authorized, active, created_at, updated_at`
        : await tx<Auditor[]>`insert into public.auditors ${tx(v, ...AUDITOR_FIELDS)}
             returning id, user_id, name, cpf, admission_date, job_title, unit_id, sector_id, authorized, active, created_at, updated_at`;
      if (!res[0]) throw new Error("Você não tem permissão para esta ação.");
      return res[0];
    }),
  );

export const auditorHasPin = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ auditorId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { rpc } = await import("@/server/db.server");
    return userTx(context, (tx) => rpc(tx, "auditor_has_pin", { _auditor_id: data.auditorId }));
  });

export const setAuditorPin = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ auditorId: uuid, pin: z.string().regex(/^(\d{4,8})?$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { rpc } = await import("@/server/db.server");
    await userTx(context, (tx) => rpc(tx, "set_auditor_pin", { _auditor_id: data.auditorId, _pin: data.pin }));
    return { ok: true };
  });
