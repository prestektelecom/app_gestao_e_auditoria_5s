import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, withRequestInfo } from "./middleware";
import { rows, userTx } from "./server-fn";

// Fluxo público de auditoria por QR (spec data-access: "Fluxo público de QR sem login").
// Nenhuma chamada usa login: as funções SQL qr_* são executadas como "anon" (como o
// navegador fazia antes) e cada chamada é autorizada pelo token do setor ou pelo
// token da sessão de auditoria, verificados no banco. As fotos usam o armazenamento
// em disco (src/server/storage.server.ts).
const BUCKET = "audit-evidences";
export const INVALID_SESSION = "Sessão da auditoria inválida.";

type Req = { ip?: string | null };
const uuid = z.string().uuid();
const sessionSchema = z.object({ auditId: uuid, session: z.string().min(32).max(128) });
const tokenSchema = z.string().min(8).max(200);

async function anon<T>(req: Req, fn: (tx: import("@/server/db.server").Tx, rpc: typeof import("@/server/db.server").rpc) => Promise<T>) {
  const { asAnon, rpc } = await import("@/server/db.server");
  return asAnon((tx) => fn(tx, rpc), req);
}

// ---------------------------------------------------------------------------
// Lógica testável (funções simples, sem contexto HTTP)
// ---------------------------------------------------------------------------
export const qrLogic = {
  sectorInfo: (req: Req, token: string) => anon(req, (tx, rpc) => rpc(tx, "qr_sector_info", { _token: token })),
  validateAuditor: (req: Req, token: string, code: string) =>
    anon(req, (tx, rpc) => rpc(tx, "qr_validate_auditor", { _token: token, _code: code })),
  startAudit: (req: Req, d: { ticket: string; companion: string; lat: number | null; lng: number | null; locationStatus: string }) =>
    anon(req, (tx, rpc) =>
      rpc(tx, "qr_start_audit", {
        _ticket: d.ticket,
        _companion: d.companion,
        _lat: d.lat as number,
        _lng: d.lng as number,
        _location_status: d.locationStatus,
      }),
    ),
  getAudit: (req: Req, auditId: string, session: string) =>
    anon(req, (tx, rpc) => rpc(tx, "qr_get_audit", { _audit_id: auditId, _session: session })),
  saveAnswer: (req: Req, d: { auditId: string; session: string; answerId: string; answer: string | null; observation: string }) =>
    anon(req, (tx, rpc) =>
      rpc(tx, "qr_save_answer", {
        _audit_id: d.auditId,
        _session: d.session,
        _answer_id: d.answerId,
        _answer: d.answer as string,
        _observation: d.observation,
      }),
    ),
  addEvidence: (req: Req, d: { auditId: string; session: string; answerId: string; path: string; source: string }) =>
    anon(req, (tx, rpc) =>
      rpc(tx, "qr_add_evidence", { _audit_id: d.auditId, _session: d.session, _answer_id: d.answerId, _path: d.path, _source: d.source }),
    ),
  finalize: (req: Req, auditId: string, session: string) =>
    anon(req, (tx, rpc) => rpc(tx, "qr_finalize", { _audit_id: auditId, _session: session })),

  /** qr_session_ok só pode ser chamada pelo servidor (revogada de anon/authenticated). */
  async assertSession(auditId: string, session: string) {
    const { asService, rpc } = await import("@/server/db.server");
    const ok = await asService((tx) => rpc(tx, "qr_session_ok", { _audit_id: auditId, _session: session }));
    if (!ok) throw new Error(INVALID_SESSION);
  },

  async uploadUrl(auditId: string, session: string, answerId: string) {
    await qrLogic.assertSession(auditId, session);
    const { asService } = await import("@/server/db.server");
    const { createUploadUrl } = await import("@/server/storage.server");
    const [audit] = await asService((tx) => tx<{ status: string }[]>`select status from public.audits where id = ${auditId}`);
    if (audit?.status !== "IN_PROGRESS") throw new Error("Auditoria já finalizada.");
    const path = `${auditId}/${answerId}/${crypto.randomUUID()}.jpg`;
    return { path, signedUrl: createUploadUrl(BUCKET, path) };
  },

  async evidenceUrls(auditId: string, session: string, paths: string[]) {
    await qrLogic.assertSession(auditId, session);
    const { readUrlMap } = await import("@/server/storage.server");
    // Só caminhos da própria auditoria: o resto é ignorado.
    return readUrlMap(BUCKET, paths.filter((p) => p.startsWith(`${auditId}/`)));
  },

  async removeEvidence(auditId: string, session: string, evidenceId: string) {
    await qrLogic.assertSession(auditId, session);
    const { asService, rpc } = await import("@/server/db.server");
    const { removeFiles } = await import("@/server/storage.server");
    const res = (await asService((tx) =>
      rpc(tx, "qr_remove_evidence", { _audit_id: auditId, _session: session, _evidence_id: evidenceId }),
    )) as { ok: boolean; path?: string; error?: string } | null;
    if (!res?.ok) throw new Error(res?.error ?? "Não foi possível remover a foto.");
    if (res.path) await removeFiles(BUCKET, [res.path]);
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------
// Server functions públicas (sem login)
// ---------------------------------------------------------------------------
export const qrSectorInfo = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) => z.object({ token: tokenSchema }).parse(d))
  .handler(({ data, context }) => qrLogic.sectorInfo(context, data.token));

export const qrValidateAuditor = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) => z.object({ token: tokenSchema, code: z.string().max(20) }).parse(d))
  .handler(({ data, context }) => qrLogic.validateAuditor(context, data.token, data.code));

export const qrStartAudit = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) =>
    z
      .object({
        ticket: z.string().min(8).max(200),
        companion: z.string().max(200),
        lat: z.number().nullable(),
        lng: z.number().nullable(),
        locationStatus: z.enum(["REGISTERED", "DENIED", "UNAVAILABLE"]),
      })
      .parse(d),
  )
  .handler(({ data, context }) => qrLogic.startAudit(context, data));

export const qrGetAudit = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) => sessionSchema.parse(d))
  .handler(({ data, context }) => qrLogic.getAudit(context, data.auditId, data.session));

export const qrSaveAnswer = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) =>
    sessionSchema.extend({ answerId: uuid, answer: z.string().max(40).nullable(), observation: z.string().max(2000) }).parse(d),
  )
  .handler(({ data, context }) => qrLogic.saveAnswer(context, data));

export const qrAddEvidence = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) =>
    sessionSchema.extend({ answerId: uuid, path: z.string().max(300), source: z.enum(["CAMERA", "GALLERY"]) }).parse(d),
  )
  .handler(({ data, context }) => qrLogic.addEvidence(context, data));

export const qrFinalize = createServerFn({ method: "POST" })
  .middleware([withRequestInfo])
  .inputValidator((d) => sessionSchema.parse(d))
  .handler(({ data, context }) => qrLogic.finalize(context, data.auditId, data.session));

export const qrUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => sessionSchema.extend({ answerId: uuid }).parse(d))
  .handler(({ data }) => qrLogic.uploadUrl(data.auditId, data.session, data.answerId));

export const qrEvidenceUrls = createServerFn({ method: "POST" })
  .inputValidator((d) => sessionSchema.extend({ paths: z.array(z.string().max(300)).max(500) }).parse(d))
  .handler(({ data }) => qrLogic.evidenceUrls(data.auditId, data.session, data.paths));

export const qrRemoveEvidence = createServerFn({ method: "POST" })
  .inputValidator((d) => sessionSchema.extend({ evidenceId: uuid }).parse(d))
  .handler(({ data }) => qrLogic.removeEvidence(data.auditId, data.session, data.evidenceId));

// ---------------------------------------------------------------------------
// Área logada: setores com o token do QR (telas de QR Codes de auditoria e manutenção)
// ---------------------------------------------------------------------------
export type QrSectorRow = { id: string; name: string; unit_id: string; qr_token: string; active: boolean };

export const listQrSectors = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) =>
    userTx(context, async (tx) =>
      rows(await tx<QrSectorRow[]>`select id, name, unit_id, qr_token, active from public.sectors order by name`),
    ),
  );
