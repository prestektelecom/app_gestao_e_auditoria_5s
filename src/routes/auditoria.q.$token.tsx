import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Camera, CheckCircle2, ChevronLeft, ImagePlus, Loader2, MapPin, RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  qrAddEvidence, qrEvidenceUrls, qrFinalize, qrGetAudit, qrRemoveEvidence, qrSaveAnswer, qrSectorInfo, qrStartAudit, qrUploadUrl, qrValidateAuditor,
} from "@/lib/qr.functions";
import { compressImage, uploadWithProgress } from "@/lib/image";
import {
  ANSWERS, CLASSIFICATION, SENSES, classificationText, computeScore, formatScore, requiresEvidence, senseLabel,
  type AnswerValue, type MedalSettings, type ScoringSettings,
} from "@/lib/checklist";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/auditoria/q/$token")({
  head: () => ({
    meta: [
      { title: "Auditoria 5S — Prestek" },
      { name: "description", content: "Execução da auditoria 5S do setor pelo QR Code." },
      { property: "og:title", content: "Auditoria 5S — Prestek" },
      { property: "og:description", content: "Execução da auditoria 5S do setor pelo QR Code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: QrAuditPage,
});

type SectorInfo = { sector_name: string; unit_name: string; active: boolean; has_checklist: boolean };
type Answer = { id: string; question: string; sense: string; order: number; answer: AnswerValue | null; observation: string | null };
type Evidence = { id: string; answer_id: string; path: string; source: "CAMERA" | "GALLERY" };
type AuditData = {
  audit: {
    id: string; audit_number: string; unit_name: string; sector_name: string; auditor_name: string; version: string;
    companion_name: string; started_at: string; finished_at: string | null; location_status: string; status: string;
    overall_score: number | null; classification: string | null;
  };
  answers: Answer[];
  evidences: Evidence[];
  settings: { scoring: ScoringSettings; medals: MedalSettings };
};
type Pending = { localId: string; answerId: string; preview: string; blob: Blob; source: "CAMERA" | "GALLERY"; progress: number; error?: string };
type Stored = { auditId: string; session: string };
type Step = "loading" | "invalid" | "resume" | "validate" | "setup" | "confirm" | "checklist" | "review" | "done";

const storeKey = (t: string) => `p5s-audit:${t}`;

function Shell({ children, info, sub }: { children: React.ReactNode; info?: { unit_name: string; sector_name: string } | null; sub?: React.ReactNode }) {
  return (
    <div className="app-backdrop min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-10 pt-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 font-mono text-[11px] font-medium text-primary">P5S</div>
          <div className="min-w-0">
            <p className="font-display text-base font-bold tracking-tight">Prestek — Auditoria 5S</p>
            {info && <p className="truncate text-xs text-muted-foreground">{info.unit_name} · {info.sector_name}</p>}
          </div>
        </div>
        <div className="tape-line mt-4 w-20" />
        {sub}
        <div className="mt-5 flex flex-1 flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

function QrAuditPage() {
  const { token } = Route.useParams();
  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<SectorInfo | null>(null);
  const [stored, setStored] = useState<Stored | null>(null);
  const [data, setData] = useState<AuditData | null>(null);

  // validation + setup state
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState<{ ticket: string; auditor: string; now: string } | null>(null);
  const [loc, setLoc] = useState<{ status: "REGISTERED" | "DENIED" | "UNAVAILABLE" | "PENDING"; lat?: number; lng?: number }>({ status: "PENDING" });
  const [companion, setCompanion] = useState("");
  const [result, setResult] = useState<{ audit_number: string; overall_score: number | null; classification: string; finished_at: string } | null>(null);

  const loadAudit = useCallback(async (s: Stored) => {
    try {
      const d = await qrGetAudit({ data: { auditId: s.auditId, session: s.session } });
      return (d ?? null) as unknown as AuditData | null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const si = await qrSectorInfo({ data: { token } }).catch(() => null);
      const sinfo = si as unknown as SectorInfo | null;
      setInfo(sinfo);
      if (!sinfo || !sinfo.active || !sinfo.has_checklist) return setStep("invalid");
      const raw = localStorage.getItem(storeKey(token));
      if (raw) {
        try {
          const s = JSON.parse(raw) as Stored;
          const d = await loadAudit(s);
          if (d && d.audit.status === "IN_PROGRESS") {
            setStored(s); setData(d); return setStep("resume");
          }
        } catch { /* ignore */ }
        localStorage.removeItem(storeKey(token));
      }
      setStep("validate");
    })();
  }, [token, loadAudit]);

  async function validate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) return setError("Informe os 6 dígitos do código.");
    setBusy(true);
    const r = await qrValidateAuditor({ data: { token, code } }).catch(() => null);
    setBusy(false);
    const res = r as unknown as { ok: boolean; error?: string; auditor_name?: string; ticket?: string; server_now?: string } | null;
    if (!res?.ok) return setError(res?.error ?? "Código inválido ou auditor não autorizado.");
    setTicket({ ticket: res.ticket!, auditor: res.auditor_name!, now: res.server_now! });
    setCode("");
    setStep("setup");
    requestLocation();
  }

  function requestLocation() {
    setLoc({ status: "PENDING" });
    if (!("geolocation" in navigator)) return setLoc({ status: "UNAVAILABLE" });
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ status: "REGISTERED", lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => setLoc({ status: err.code === err.PERMISSION_DENIED ? "DENIED" : "UNAVAILABLE" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  async function start() {
    if (!ticket) return;
    setBusy(true);
    const status = loc.status === "PENDING" ? "UNAVAILABLE" : loc.status;
    const r = await qrStartAudit({ data: {
      ticket: ticket.ticket, companion: companion.trim(), lat: loc.lat ?? null, lng: loc.lng ?? null, locationStatus: status,
    } }).catch(() => null);
    const res = r as unknown as { ok: boolean; error?: string; audit_id?: string; session?: string } | null;
    if (!res?.ok) { setBusy(false); toast.error(res?.error ?? "Não foi possível iniciar."); if (res?.error?.includes("expirada")) setStep("validate"); return; }
    const s = { auditId: res.audit_id!, session: res.session! };
    localStorage.setItem(storeKey(token), JSON.stringify(s));
    const d = await loadAudit(s);
    setBusy(false);
    setStored(s); setData(d); setStep("checklist");
  }

  const shellInfo = info ? { unit_name: info.unit_name, sector_name: info.sector_name } : null;

  if (step === "loading") return <Shell><div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></Shell>;

  if (step === "invalid") return (
    <Shell info={shellInfo}>
      <div className="panel p-6 text-center">
        <AlertTriangle className="mx-auto size-6 text-destructive" />
        <p className="mt-3 font-display text-lg font-semibold">QR Code indisponível</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {!info ? "Este QR Code não corresponde a nenhum setor." : !info.active ? "Este setor está inativo." : "Nenhum checklist publicado no momento."}
        </p>
      </div>
    </Shell>
  );

  if (step === "resume" && data) {
    const answered = data.answers.filter((a) => a.answer).length;
    return (
      <Shell info={shellInfo}>
        <div className="panel p-6">
          <p className="eyebrow">Auditoria em andamento</p>
          <p className="mt-2 font-display text-xl font-bold">{data.audit.audit_number}</p>
          <p className="mt-1 text-sm text-muted-foreground">Auditor: {data.audit.auditor_name} · {answered} de {data.answers.length} respondidas</p>
          <div className="mt-5 grid gap-2">
            <Button size="lg" onClick={() => setStep("checklist")}>Continuar auditoria</Button>
            <Button size="lg" variant="outline" onClick={() => { localStorage.removeItem(storeKey(token)); setData(null); setStored(null); setStep("validate"); }}>
              Iniciar nova auditoria
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">A auditoria não concluída continuará registrada como "Em andamento".</p>
        </div>
      </Shell>
    );
  }

  if (step === "validate") return (
    <Shell info={shellInfo}>
      <form onSubmit={validate} className="panel grid gap-4 p-6">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="eyebrow">Unidade</dt><dd className="text-right font-medium">{info?.unit_name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="eyebrow">Setor</dt><dd className="text-right font-medium">{info?.sector_name}</dd></div>
        </dl>
        <div className="grid gap-2">
          <Label htmlFor="code">Código do Auditor</Label>
          <Input id="code" inputMode="numeric" autoComplete="off" type="password" maxLength={6} placeholder="••••••"
            className="h-14 text-center font-mono text-2xl tracking-[0.5em]" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <Button size="lg" className="h-12" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} VALIDAR</Button>
      </form>
    </Shell>
  );

  if (step === "setup" && ticket) {
    const now = new Date(ticket.now);
    return (
      <Shell info={shellInfo}>
        <div className="panel grid gap-4 p-6">
          <div className="flex items-center gap-2 text-success"><CheckCircle2 className="size-5" /><span className="font-medium">Auditor identificado: {ticket.auditor}</span></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="eyebrow">Data</p><p className="mt-1 font-medium">{formatDate(ticket.now)}</p></div>
            <div><p className="eyebrow">Hora</p><p className="mt-1 font-medium">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p></div>
          </div>
          <LocationBadge loc={loc.status} onRetry={requestLocation} />
          <div className="grid gap-2">
            <Label htmlFor="comp">Pessoa que acompanhou a auditoria *</Label>
            <Input id="comp" value={companion} maxLength={120} placeholder="Ex.: Maria da Silva" onChange={(e) => setCompanion(e.target.value)} />
          </div>
          <Button size="lg" className="h-12" disabled={companion.trim().length < 2 || loc.status === "PENDING"} onClick={() => setStep("confirm")}>
            Continuar
          </Button>
        </div>
      </Shell>
    );
  }

  if (step === "confirm" && ticket) {
    const now = new Date(ticket.now);
    const rows: [string, string][] = [
      ["Unidade", info?.unit_name ?? ""], ["Setor", info?.sector_name ?? ""], ["Auditor", ticket.auditor],
      ["Data", formatDate(ticket.now)], ["Hora", now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })],
      ["Localização", loc.status === "REGISTERED" ? "Registrada" : "Não registrada"], ["Acompanhante", companion.trim()],
    ];
    return (
      <Shell info={shellInfo}>
        <div className="panel grid gap-4 p-6">
          <p className="font-display text-lg font-semibold">Confirme os dados</p>
          <dl className="grid gap-2 text-sm">
            {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-border pb-2"><dt className="eyebrow">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
          </dl>
          <Button size="lg" className="h-12" disabled={busy} onClick={start}>{busy && <Loader2 className="size-4 animate-spin" />} INICIAR AUDITORIA</Button>
          <Button variant="ghost" onClick={() => setStep("setup")}>Voltar</Button>
        </div>
      </Shell>
    );
  }

  if ((step === "checklist" || step === "review") && data && stored) {
    return (
      <AuditRunner token={token} stored={stored} data={data} setData={setData} step={step} setStep={setStep}
        onDone={(r) => { localStorage.removeItem(storeKey(token)); setResult(r); setStep("done"); }} />
    );
  }

  if (step === "done" && result) {
    const cls = CLASSIFICATION[result.classification];
    return (
      <Shell info={shellInfo}>
        <div className="panel rise grid gap-3 p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <p className="font-display text-xl font-bold">Auditoria concluída com sucesso</p>
          <p className="text-sm text-muted-foreground">Auditoria: <span className="font-mono">{result.audit_number}</span></p>
          <div className="empty-well mt-2 py-6">
            <p className="eyebrow">Nota Geral</p>
            <p className="mt-1 font-display text-4xl font-bold">{formatScore(result.overall_score)}</p>
            <p className="mt-2 text-lg font-semibold">{cls?.emoji} {cls?.label.toUpperCase()}</p>
          </div>
          <p className="text-xs text-muted-foreground">Concluída em {formatDateTime(result.finished_at)}</p>
        </div>
      </Shell>
    );
  }

  return <Shell><div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></Shell>;
}

function LocationBadge({ loc, onRetry }: { loc: string; onRetry: () => void }) {
  if (loc === "PENDING") return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Obtendo localização…</p>;
  if (loc === "REGISTERED") return <p className="flex items-center gap-2 text-sm text-success"><MapPin className="size-4" /> Localização registrada</p>;
  return (
    <div className="rounded-lg border border-tape/60 bg-tape/10 p-3 text-sm">
      <p>⚠ Localização não registrada. A auditoria poderá continuar.</p>
      <p className="mt-1 text-xs text-muted-foreground">{loc === "DENIED" ? "Permissão negada no navegador." : "Localização indisponível."}</p>
      <button type="button" className="mt-2 text-xs text-primary underline" onClick={onRetry}>Tentar novamente</button>
    </div>
  );
}

function AuditRunner({
  token, stored, data, setData, step, setStep, onDone,
}: {
  token: string; stored: Stored; data: AuditData; setData: (d: AuditData) => void; step: Step; setStep: (s: Step) => void;
  onDone: (r: { audit_number: string; overall_score: number | null; classification: string; finished_at: string }) => void;
}) {
  const getUpload = useServerFn(qrUploadUrl);
  const getUrls = useServerFn(qrEvidenceUrls);
  const removeEv = useServerFn(qrRemoveEvidence);
  const [answers, setAnswers] = useState<Answer[]>(data.answers);
  const [evidences, setEvidences] = useState<Evidence[]>(data.evidences);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(0);
  const [saveError, setSaveError] = useState(false);
  const [sense, setSense] = useState<string>(SENSES[0].code);
  const [confirm, setConfirm] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const obsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const topRef = useRef<HTMLDivElement>(null);

  const sensesPresent = useMemo(() => SENSES.filter((s) => answers.some((a) => a.sense === s.code)), [answers]);
  useEffect(() => { if (sensesPresent[0] && !sensesPresent.some((s) => s.code === sense)) setSense(sensesPresent[0].code); }, [sensesPresent, sense]);

  const refreshUrls = useCallback(async (paths: string[]) => {
    const missing = paths.filter((p) => !urls[p]);
    if (!missing.length) return;
    try {
      const r = await getUrls({ data: { auditId: stored.auditId, session: stored.session, paths: missing } });
      setUrls((u) => ({ ...u, ...r }));
    } catch { /* thumbnails optional */ }
  }, [getUrls, stored, urls]);
  useEffect(() => { refreshUrls(evidences.map((e) => e.path)); }, [evidences]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(a: Answer) {
    setSaving((n) => n + 1);
    let error = false;
    const r = await qrSaveAnswer({ data: {
      auditId: stored.auditId, session: stored.session, answerId: a.id, answer: a.answer ?? null, observation: a.observation ?? "",
    } }).catch(() => { error = true; return null; });
    setSaving((n) => n - 1);
    const res = r as unknown as { ok: boolean; error?: string } | null;
    if (error || !res?.ok) { setSaveError(true); toast.error(res?.error ?? "Falha ao salvar. Verifique a conexão."); return false; }
    setSaveError(false);
    return true;
  }

  function setAnswer(id: string, answer: AnswerValue) {
    let updated: Answer | undefined;
    setAnswers((list) => list.map((a) => (a.id === id ? (updated = { ...a, answer }) : a)));
    setTimeout(() => updated && persist(updated), 0);
  }
  function setObservation(id: string, observation: string) {
    let updated: Answer | undefined;
    setAnswers((list) => list.map((a) => (a.id === id ? (updated = { ...a, observation }) : a)));
    clearTimeout(obsTimers.current[id]);
    obsTimers.current[id] = setTimeout(() => updated && persist(updated), 900);
  }

  async function uploadOne(p: Pending) {
    setPending((l) => l.map((x) => (x.localId === p.localId ? { ...x, progress: 0, error: undefined } : x)));
    try {
      const { path, signedUrl } = await getUpload({ data: { auditId: stored.auditId, session: stored.session, answerId: p.answerId } });
      await uploadWithProgress(signedUrl, p.blob, (pct) => setPending((l) => l.map((x) => (x.localId === p.localId ? { ...x, progress: pct } : x))));
      const r = await qrAddEvidence({ data: {
        auditId: stored.auditId, session: stored.session, answerId: p.answerId, path, source: p.source,
      } });
      const res = r as unknown as { ok: boolean; id?: string; error?: string } | null;
      if (!res?.ok) throw new Error(res?.error ?? "Falha ao registrar a foto.");
      setEvidences((l) => [...l, { id: res.id!, answer_id: p.answerId, path, source: p.source }]);
      setUrls((u) => ({ ...u, [path]: p.preview }));
      setPending((l) => l.filter((x) => x.localId !== p.localId));
    } catch (e) {
      setPending((l) => l.map((x) => (x.localId === p.localId ? { ...x, error: (e as Error).message || "Falha no envio." } : x)));
    }
  }

  async function addFiles(answerId: string, files: FileList | null, source: "CAMERA" | "GALLERY") {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) { toast.error("Selecione apenas imagens."); continue; }
      const blob = await compressImage(f);
      const p: Pending = { localId: crypto.randomUUID(), answerId, preview: URL.createObjectURL(blob), blob, source, progress: 0 };
      setPending((l) => [...l, p]);
      uploadOne(p);
    }
  }

  async function removeEvidence(ev: Evidence) {
    try {
      await removeEv({ data: { auditId: stored.auditId, session: stored.session, evidenceId: ev.id } });
      setEvidences((l) => l.filter((e) => e.id !== ev.id));
    } catch (e) { toast.error((e as Error).message); }
  }

  const answeredCount = answers.filter((a) => a.answer).length;
  const pct = answers.length ? Math.round((answeredCount / answers.length) * 100) : 0;
  const evCount = (id: string) => evidences.filter((e) => e.answer_id === id).length;
  const issues = useMemo(() => {
    const list: { id: string; order: number; sense: string; msg: string }[] = [];
    for (const a of answers) {
      if (!a.answer) list.push({ id: a.id, order: a.order, sense: a.sense, msg: "sem resposta" });
      else if (requiresEvidence(a.answer)) {
        const tag = a.answer === "NON_COMPLIANT" ? "NC" : "NCP";
        if (!a.observation?.trim()) list.push({ id: a.id, order: a.order, sense: a.sense, msg: `${tag} sem observação` });
        if (!evidences.some((e) => e.answer_id === a.id)) list.push({ id: a.id, order: a.order, sense: a.sense, msg: `${tag} sem foto` });
      }
    }
    return list;
  }, [answers, evidences]);
  const prelim = computeScore(answers, data.settings.scoring, data.settings.medals);
  const counts = {
    C: answers.filter((a) => a.answer === "COMPLIANT").length,
    NCP: answers.filter((a) => a.answer === "PARTIALLY_NON_COMPLIANT").length,
    NC: answers.filter((a) => a.answer === "NON_COMPLIANT").length,
    NA: answers.filter((a) => a.answer === "NOT_APPLICABLE").length,
  };
  const blocked = issues.length > 0 || pending.length > 0 || saving > 0 || saveError;

  async function finalize() {
    setFinalizing(true);
    const r = await qrFinalize({ data: { auditId: stored.auditId, session: stored.session } }).catch(() => null);
    setFinalizing(false);
    const res = r as unknown as { ok: boolean; error?: string; audit_number: string; overall_score: number | null; classification: string; finished_at: string } | null;
    if (!res?.ok) { setConfirm(false); return toast.error(res?.error ?? "Não foi possível finalizar."); }
    onDone(res);
  }

  const header = (
    <div ref={topRef} className="glass sticky top-0 z-20 -mx-4 mt-4 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold">Auditoria 5S · <span className="font-mono text-xs">{data.audit.audit_number}</span></p>
          <p className="truncate text-xs text-muted-foreground">{data.audit.unit_name} / {data.audit.sector_name}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {saving > 0 || pending.length ? "Salvando…" : saveError ? <span className="text-destructive">Não salvo</span> : "Salvo"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Progress value={pct} className="h-2" />
        <span className="shrink-0 text-xs font-medium">{pct}%</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{answeredCount} de {answers.length} respondidas</p>
    </div>
  );

  if (step === "review") {
    return (
      <Shell sub={header}>
        <button className="flex w-fit items-center gap-1 text-sm text-muted-foreground" onClick={() => setStep("checklist")}><ChevronLeft className="size-4" /> Voltar ao checklist</button>
        <div className="panel grid gap-4 p-5">
          <p className="font-display text-lg font-semibold">Revisão da Auditoria</p>
          <p className="text-sm font-medium">{answeredCount}/{answers.length} perguntas respondidas</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["Conforme", counts.C], ["NCP", counts.NCP], ["NC", counts.NC], ["N/A", counts.NA]].map(([k, v]) => (
              <div key={k} className="empty-well py-3"><p className="font-display text-xl font-bold">{v}</p><p className="eyebrow">{k}</p></div>
            ))}
          </div>
          <div className="empty-well py-4 text-center">
            <p className="eyebrow">Nota preliminar</p>
            <p className="mt-1 font-display text-2xl font-bold">{formatScore(prelim.score)} — {classificationText(prelim.classification).toUpperCase()}</p>
          </div>
          {(issues.length > 0 || pending.length > 0 || saveError) && (
            <div className="grid gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">Pendências antes de finalizar</p>
              {pending.length > 0 && <p>• {pending.length} foto(s) com envio pendente</p>}
              {saveError && <p>• Há respostas não salvas — verifique a conexão</p>}
              {issues.slice(0, 30).map((i) => (
                <button key={i.id + i.msg} className="text-left hover:underline" onClick={() => { setSense(i.sense); setStep("checklist"); setTimeout(() => document.getElementById(`q-${i.id}`)?.scrollIntoView({ block: "center" }), 50); }}>
                  • Pergunta {String(i.order).padStart(2, "0")}: {i.msg}
                </button>
              ))}
            </div>
          )}
          <Button size="lg" className="h-12" disabled={blocked} onClick={() => setConfirm(true)}>FINALIZAR AUDITORIA</Button>
        </div>
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Finalizar auditoria?</AlertDialogTitle>
              <AlertDialogDescription>Deseja finalizar esta auditoria? Após a finalização, as respostas não poderão ser alteradas pelo Auditor.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={finalizing}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={finalizing} onClick={(e) => { e.preventDefault(); finalize(); }}>
                {finalizing && <Loader2 className="size-4 animate-spin" />} Sim, finalizar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Shell>
    );
  }

  const current = answers.filter((a) => a.sense === sense);
  const idx = sensesPresent.findIndex((s) => s.code === sense);

  return (
    <Shell sub={header}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {sensesPresent.map((s, i) => {
          const list = answers.filter((a) => a.sense === s.code);
          const done = list.every((a) => a.answer);
          return (
            <button key={s.code} onClick={() => { setSense(s.code); topRef.current?.scrollIntoView(); }}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                s.code === sense ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/60",
                done && s.code !== sense && "border-success/40 text-success")}>
              {i + 1}. {s.label} {done && "✓"}
            </button>
          );
        })}
      </div>
      <h2 className="text-lg font-semibold">{idx + 1}. {senseLabel(sense)}</h2>
      {current.map((a) => {
        const evs = evidences.filter((e) => e.answer_id === a.id);
        const pend = pending.filter((p) => p.answerId === a.id);
        const need = requiresEvidence(a.answer);
        return (
          <div key={a.id} id={`q-${a.id}`} className={cn("panel grid gap-3 p-4", need && "border-destructive/40")}>
            <p className="text-sm leading-relaxed"><span className="mr-1 font-mono text-xs text-muted-foreground">{String(a.order).padStart(2, "0")}.</span>{a.question}</p>
            <div className="grid grid-cols-2 gap-2">
              {ANSWERS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => setAnswer(a.id, opt.value)}
                  className={cn("min-h-12 rounded-xl border px-2 py-2 text-sm font-medium transition",
                    a.answer === opt.value
                      ? opt.value === "COMPLIANT" ? "border-success bg-success text-success-foreground"
                        : opt.value === "NOT_APPLICABLE" ? "border-foreground/40 bg-muted text-foreground"
                        : "border-destructive bg-destructive text-destructive-foreground"
                      : "border-border bg-card/70 hover:bg-card")}>
                  {opt.label}
                </button>
              ))}
            </div>
            {a.answer && (
              <>
                <Textarea placeholder={need ? "Observação (obrigatória)" : "Observação (opcional)"} value={a.observation ?? ""} maxLength={2000}
                  className={cn(need && !a.observation?.trim() && "border-destructive")}
                  onChange={(e) => setObservation(a.id, e.target.value)} />
                {a.answer !== "NOT_APPLICABLE" && (
                  <div className="grid gap-2">
                    <div className="flex flex-wrap gap-2">
                      {evs.map((e) => (
                        <div key={e.id} className="relative size-20 overflow-hidden rounded-lg border border-border bg-muted">
                          {urls[e.path] ? <img src={urls[e.path]} alt="Evidência" className="size-full object-cover" onClick={() => setViewer(urls[e.path]!)} />
                            : <Loader2 className="m-auto mt-7 size-4 animate-spin" />}
                          <button type="button" aria-label="Remover foto" onClick={() => removeEvidence(e)}
                            className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-foreground/70 text-background"><X className="size-3.5" /></button>
                        </div>
                      ))}
                      {pend.map((p) => (
                        <div key={p.localId} className="relative size-20 overflow-hidden rounded-lg border border-border">
                          <img src={p.preview} alt="Enviando" className="size-full object-cover opacity-60" />
                          <div className="absolute inset-0 grid place-items-center text-xs font-medium">
                            {p.error ? (
                              <button type="button" onClick={() => uploadOne(p)} className="grid place-items-center gap-0.5 rounded bg-destructive px-1.5 py-1 text-destructive-foreground">
                                <RotateCw className="size-3.5" /> Tentar
                              </button>
                            ) : `${p.progress}%`}
                          </div>
                        </div>
                      ))}
                    </div>
                    {pend.some((p) => p.error) && <p className="text-xs text-destructive">Falha ao enviar foto. Toque em "Tentar" para reenviar.</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card/70 text-sm">
                        <Camera className="size-4" /> Câmera
                        <input type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={(e) => { addFiles(a.id, e.target.files, "CAMERA"); e.target.value = ""; }} />
                      </label>
                      <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card/70 text-sm">
                        <ImagePlus className="size-4" /> Galeria
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={(e) => { addFiles(a.id, e.target.files, "GALLERY"); e.target.value = ""; }} />
                      </label>
                    </div>
                    {need && evCount(a.id) === 0 && <p className="text-xs text-destructive">Adicione pelo menos 1 foto.</p>}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={idx <= 0} onClick={() => { setSense(sensesPresent[idx - 1]!.code); topRef.current?.scrollIntoView(); }}>Anterior</Button>
        {idx < sensesPresent.length - 1
          ? <Button onClick={() => { setSense(sensesPresent[idx + 1]!.code); topRef.current?.scrollIntoView(); }}>Próximo senso</Button>
          : <Button onClick={() => setStep("review")}>Revisar</Button>}
      </div>
      <Button variant="ghost" onClick={() => setStep("review")}>Ir para revisão</Button>
      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-3xl p-2"><DialogTitle className="sr-only">Foto</DialogTitle>{viewer && <img src={viewer} alt="Evidência" className="w-full rounded" />}</DialogContent>
      </Dialog>
    </Shell>
  );
}
