import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, withRequestInfo, type UserContext } from "./middleware";
import { assertTouched, rows, userTx } from "./server-fn";
import type { MaintNote } from "./maintenance";

// Notas de manutenção: abertura (QR público ou área logada), fotos, listagem,
// edição e exclusão. Fotos ficam em disco (src/server/storage.server.ts).
const BUCKET = "maintenance-images";
export const MAX_NOTE_IMAGES = 6;
export const NO_PERMISSION = "Você não tem permissão para esta ação.";

type CreateResult = { ok: boolean; id?: string; number?: string; upload_token?: string; error?: string } | null;
type Req = { ip?: string | null };

const noteInput = z.object({
  requester: z.string().max(200),
  date: z.string().max(10).nullable(),
  time: z.string().max(8).nullable(),
  description: z.string().max(3000),
});

const noteUpdate = z.object({
  id: z.string().uuid(),
  note_date: z.string().max(10),
  note_time: z.string().max(8),
  requester_name: z.string().trim().min(2).max(120),
  unit_id: z.string().uuid(),
  sector_id: z.string().uuid(),
  description: z.string().trim().min(5).max(3000),
  status: z.enum(["ABERTA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA"]),
  assignee_name: z.string().trim().max(120).nullable(),
  due_date: z.string().max(10).nullable(),
  resolution: z.string().trim().max(3000).nullable(),
  removedImageIds: z.array(z.string().uuid()).max(50),
});
export type MaintNoteUpdate = z.infer<typeof noteUpdate>;

// ---------------------------------------------------------------------------
// Lógica testável
// ---------------------------------------------------------------------------
export const maintLogic = {
  async sectorInfo(req: Req, token: string) {
    const { asAnon, rpc } = await import("@/server/db.server");
    return asAnon((tx) => rpc(tx, "maint_sector_info", { _token: token }), req) as Promise<{ unit_name: string; sector_name: string } | null>;
  },

  /** Abertura pelo QR (sem login): roda como anon, autorizada pelo token do setor. */
  async createFromQr(req: Req, token: string, d: z.infer<typeof noteInput>) {
    const { asAnon, rpc } = await import("@/server/db.server");
    return asAnon(
      (tx) =>
        rpc(tx, "maint_create_note", {
          _token: token,
          _sector_id: null as unknown as string,
          _requester: d.requester,
          _date: d.date as string,
          _time: d.time as string,
          _description: d.description,
        }),
      req,
    ) as Promise<CreateResult>;
  },

  /** Abertura pela área logada: a função SQL usa auth.uid() para validar o usuário ativo. */
  async createInternal(ctx: UserContext, sectorId: string, d: z.infer<typeof noteInput>) {
    const { rpc } = await import("@/server/db.server");
    return userTx(ctx, (tx) =>
      rpc(tx, "maint_create_note", {
        _token: "",
        _sector_id: sectorId,
        _requester: d.requester,
        _date: d.date as string,
        _time: d.time as string,
        _description: d.description,
      }),
    ) as Promise<CreateResult>;
  },

  /** URLs de envio das fotos, autorizadas pelo token de uso único devolvido por maint_create_note. */
  async uploadUrls(noteId: string, token: string, count: number) {
    const { asService } = await import("@/server/db.server");
    const { sha256 } = await import("@/server/auth.server");
    const { createUploadUrl } = await import("@/server/storage.server");
    return asService(async (tx) => {
      const [t] = await tx<{ token_hash: string; expired: boolean }[]>`
        select token_hash, expires_at < now() as expired from public.maintenance_upload_tickets where note_id = ${noteId}`;
      if (!t || t.token_hash !== sha256(token) || t.expired) throw new Error("Prazo para envio das imagens expirou.");
      const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`select count(*)::int as n from public.maintenance_note_images where note_id = ${noteId}`;
      if (n + count > MAX_NOTE_IMAGES) throw new Error(`Máximo de ${MAX_NOTE_IMAGES} imagens por nota.`);
      const out: { path: string; signedUrl: string }[] = [];
      for (let i = 0; i < count; i++) {
        const path = `${noteId}/${crypto.randomUUID()}.jpg`;
        out.push({ path, signedUrl: createUploadUrl(BUCKET, path) });
      }
      for (const o of out) await tx`insert into public.maintenance_note_images (note_id, storage_path) values (${noteId}, ${o.path})`;
      return out;
    });
  },

  async listNotes(ctx: UserContext) {
    return userTx(ctx, async (tx) =>
      rows(
        await tx<MaintNote[]>`
          select n.*,
                 coalesce((select json_agg(json_build_object('id', i.id, 'storage_path', i.storage_path) order by i.created_at)
                           from public.maintenance_note_images i where i.note_id = n.id), '[]'::json) as maintenance_note_images
          from public.maintenance_notes n
          order by n.created_at desc`,
      ),
    );
  },

  /** Links de leitura só para usuário ativo e só para fotos que existem em notas visíveis a ele. */
  async imageUrls(ctx: UserContext, paths: string[]) {
    const { rpc } = await import("@/server/db.server");
    const { readUrlMap } = await import("@/server/storage.server");
    const allowed = await userTx(ctx, async (tx) => {
      if (!(await rpc(tx, "is_active_user", { _user_id: ctx.userId }))) throw new Error(NO_PERMISSION);
      if (!paths.length) return [];
      return (await tx<{ storage_path: string }[]>`
        select storage_path from public.maintenance_note_images where storage_path = any(${paths}::text[])`).map((r) => r.storage_path);
    });
    return readUrlMap(BUCKET, allowed);
  },

  async updateNote(ctx: UserContext, d: MaintNoteUpdate) {
    const { rpc } = await import("@/server/db.server");
    const { removeFiles } = await import("@/server/storage.server");
    const removed = await userTx(ctx, async (tx) => {
      if (!(await rpc(tx, "can_manage_maintenance", { _user_id: ctx.userId }))) throw new Error(NO_PERMISSION);
      const [place] = await tx<{ unit_name: string; sector_name: string }[]>`
        select u.name as unit_name, s.name as sector_name
        from public.sectors s join public.units u on u.id = s.unit_id
        where s.id = ${d.sector_id} and u.id = ${d.unit_id}`;
      if (!place) throw new Error("Selecione a unidade e o setor.");
      let paths: string[] = [];
      if (d.removedImageIds.length) {
        paths = (await tx<{ storage_path: string }[]>`
          delete from public.maintenance_note_images
          where note_id = ${d.id} and id = any(${d.removedImageIds}::uuid[]) returning storage_path`).map((r) => r.storage_path);
      }
      assertTouched(
        await tx`update public.maintenance_notes set
          note_date = ${d.note_date}, note_time = ${d.note_time}, requester_name = ${d.requester_name},
          unit_id = ${d.unit_id}, unit_name = ${place.unit_name}, sector_id = ${d.sector_id}, sector_name = ${place.sector_name},
          description = ${d.description}, status = ${d.status}, priority = ${d.priority},
          assignee_name = ${d.assignee_name}, due_date = ${d.due_date}, resolution = ${d.resolution}
          where id = ${d.id}`,
      );
      return paths;
    });
    // Arquivos só saem depois do commit: se a gravação falhasse, nada se perde.
    if (removed.length) await removeFiles(BUCKET, removed);
    return { ok: true };
  },

  async deleteNote(ctx: UserContext, id: string) {
    const { rpc } = await import("@/server/db.server");
    const { removeFiles } = await import("@/server/storage.server");
    const paths = await userTx(ctx, async (tx) => {
      if (!(await rpc(tx, "can_manage_maintenance", { _user_id: ctx.userId }))) throw new Error(NO_PERMISSION);
      const p = (await tx<{ storage_path: string }[]>`select storage_path from public.maintenance_note_images where note_id = ${id}`).map(
        (r) => r.storage_path,
      );
      assertTouched(await tx`delete from public.maintenance_notes where id = ${id}`);
      return p;
    });
    if (paths.length) await removeFiles(BUCKET, paths);
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------
export const maintSectorInfo = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) => z.object({ token: z.string().min(8).max(200) }).parse(d))
  .handler(({ data, context }) => maintLogic.sectorInfo(context, data.token));

export const createMaintNoteQr = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) => noteInput.extend({ token: z.string().min(8).max(200) }).parse(d))
  .handler(({ data, context }) => maintLogic.createFromQr(context, data.token, data));

export const createMaintNote = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => noteInput.extend({ sectorId: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => maintLogic.createInternal(context, data.sectorId, data));

export const maintUploadUrls = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ noteId: z.string().uuid(), token: z.string().min(32).max(128), count: z.number().int().min(1).max(MAX_NOTE_IMAGES) }).parse(d),
  )
  .handler(({ data }) => maintLogic.uploadUrls(data.noteId, data.token, data.count));

export const listMaintNotes = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) => maintLogic.listNotes(context));

export const getMaintenanceImageUrls = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ paths: z.array(z.string().max(300)).max(200) }).parse(d))
  .handler(({ data, context }) => maintLogic.imageUrls(context, data.paths));

export const updateMaintNote = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => noteUpdate.parse(d))
  .handler(({ data, context }) => maintLogic.updateNote(context, data));

export const deleteMaintNoteFn = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(({ data, context }) => maintLogic.deleteNote(context, data.id));
