import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { auditorHasPin, saveAuditor, setAuditorPin } from "@/lib/registry.functions";
import { createUser, updateUser } from "@/lib/admin-users.functions";
import { friendlyError, isValidCpf, maskCpf, onlyDigits } from "@/lib/format";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/permissions";
import type { Auditor, Sector, Unit, UserRow } from "@/lib/queries";
import { Field, useInvalidateRegistry } from "@/components/app/unit-sector-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
      {label} <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

export function UserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user?: UserRow | null }) {
  const invalidate = useInvalidateRegistry();
  const create = useServerFn(createUser);
  const update = useServerFn(updateUser);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "auditor" as Role, system_access: true, active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setErrors({});
      setF({
        name: user?.name ?? "", email: user?.email ?? "", password: "", role: user?.role ?? "auditor",
        system_access: user?.system_access ?? true, active: user?.active ?? true,
      });
    }
  }, [open, user]);

  async function save() {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Nome completo é obrigatório.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Informe um e-mail válido.";
    if (!user && f.password.length < 8) e.password = "A senha inicial deve ter ao menos 8 caracteres.";
    if (user && f.password && f.password.length < 8) e.password = "A nova senha deve ter ao menos 8 caracteres.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const base = { name: f.name.trim(), email: f.email.trim().toLowerCase(), role: f.role, system_access: f.system_access, active: f.active };
      if (user) await update({ data: { ...base, id: user.id, password: f.password || undefined } });
      else await create({ data: { ...base, password: f.password } });
      toast.success(user ? "Usuário atualizado." : "Usuário criado.");
      await invalidate();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{user ? "Editar usuário" : "Novo usuário"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Nome completo *" error={errors.name} htmlFor="usr-name">
            <Input id="usr-name" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="E-mail *" error={errors.email} htmlFor="usr-email">
            <Input id="usr-email" type="email" value={f.email} maxLength={255} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label={user ? "Nova senha (opcional)" : "Senha inicial *"} error={errors.password} htmlFor="usr-pw">
            <Input id="usr-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label="Perfil *">
            <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as Role })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Toggle label="Acesso ao sistema" checked={f.system_access} onChange={(v) => setF({ ...f, system_access: v })} />
          <Toggle label="Usuário ativo" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NONE = "__none__";

export function AuditorDialog({
  open, onOpenChange, auditor, units, sectors, users, auditors,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; auditor?: Auditor | null;
  units: Unit[]; sectors: Sector[]; users: UserRow[]; auditors: Auditor[];
}) {
  const invalidate = useInvalidateRegistry();
  const empty = { name: "", cpf: "", admission_date: "", job_title: "", unit_id: "", sector_id: "", user_id: "", system_access: false, authorized: true, active: true, pin: "" };
  const [f, setF] = useState(empty);
  const [hasPin, setHasPin] = useState(false);
  const [clearPin, setClearPin] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setClearPin(false);
    setHasPin(false);
    setF(auditor ? {
      name: auditor.name, cpf: maskCpf(auditor.cpf), admission_date: auditor.admission_date ?? "", job_title: auditor.job_title ?? "",
      unit_id: auditor.unit_id, sector_id: auditor.sector_id, user_id: auditor.user_id ?? "", system_access: !!auditor.user_id,
      authorized: auditor.authorized, active: auditor.active, pin: "",
    } : empty);
    if (auditor) auditorHasPin({ data: { auditorId: auditor.id } }).then((v) => setHasPin(!!v)).catch(() => setHasPin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, auditor]);

  const unitSectors = useMemo(() => sectors.filter((s) => s.unit_id === f.unit_id && (s.active || s.id === f.sector_id)), [sectors, f.unit_id, f.sector_id]);
  const takenUsers = new Set(auditors.filter((a) => a.user_id && a.id !== auditor?.id).map((a) => a.user_id));
  const userOptions = users.filter((u) => !takenUsers.has(u.id));

  async function save() {
    const e: Record<string, string> = {};
    const cpf = onlyDigits(f.cpf);
    if (f.name.trim().length < 2) e.name = "Nome completo é obrigatório.";
    if (!isValidCpf(cpf)) e.cpf = "CPF inválido.";
    else if (auditors.some((a) => a.cpf === cpf && a.id !== auditor?.id)) e.cpf = "Este CPF já está cadastrado.";
    if (!f.unit_id) e.unit_id = "Selecione a unidade.";
    if (!f.sector_id) e.sector_id = "Selecione o setor.";
    else if (!sectors.some((s) => s.id === f.sector_id && s.unit_id === f.unit_id)) e.sector_id = "O setor não pertence à unidade selecionada.";
    if (f.system_access && !f.user_id) e.user_id = "Selecione o usuário vinculado.";
    if (f.pin && !/^\d{4,8}$/.test(f.pin)) e.pin = "O PIN deve ter de 4 a 8 dígitos.";
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    const payload = {
      name: f.name.trim(), cpf, admission_date: f.admission_date || null, job_title: f.job_title.trim() || null,
      unit_id: f.unit_id, sector_id: f.sector_id, user_id: f.system_access ? f.user_id : null,
      authorized: f.authorized, active: f.active,
    };
    let id: string;
    try {
      id = (await saveAuditor({ data: { ...payload, ...(auditor ? { id: auditor.id } : {}) } })).id;
    } catch (error) {
      setBusy(false);
      return toast.error(friendlyError(error));
    }
    if (f.pin || clearPin) {
      try {
        await setAuditorPin({ data: { auditorId: id, pin: clearPin ? "" : f.pin } });
      } catch (error) {
        toast.error(friendlyError(error));
      }
    }
    setBusy(false);
    toast.success(auditor ? "Auditor atualizado." : "Auditor cadastrado.");
    await invalidate();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{auditor ? "Editar auditor" : "Novo auditor"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nome completo *" error={errors.name} htmlFor="a-name">
              <Input id="a-name" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
          </div>
          <Field label="CPF *" error={errors.cpf} htmlFor="a-cpf">
            <Input id="a-cpf" inputMode="numeric" placeholder="000.000.000-00" autoComplete="off" value={f.cpf}
              onChange={(e) => setF({ ...f, cpf: maskCpf(e.target.value) })} />
          </Field>
          <Field label="Data de admissão" htmlFor="a-adm">
            <Input id="a-adm" type="date" value={f.admission_date} onChange={(e) => setF({ ...f, admission_date: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Cargo" htmlFor="a-job">
              <Input id="a-job" value={f.job_title} maxLength={120} onChange={(e) => setF({ ...f, job_title: e.target.value })} />
            </Field>
          </div>
          <Field label="Unidade *" error={errors.unit_id}>
            <Select value={f.unit_id || undefined} onValueChange={(v) => setF({ ...f, unit_id: v, sector_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
              <SelectContent>{units.filter((u) => u.active || u.id === f.unit_id).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Setor *" error={errors.sector_id}>
            <Select value={f.sector_id || undefined} onValueChange={(v) => setF({ ...f, sector_id: v })} disabled={!f.unit_id}>
              <SelectTrigger><SelectValue placeholder={f.unit_id ? (unitSectors.length ? "Selecione o setor" : "Unidade sem setores") : "Selecione a unidade primeiro"} /></SelectTrigger>
              <SelectContent>{unitSectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2 grid gap-3">
            <Toggle label="Acesso ao sistema" checked={f.system_access} onChange={(v) => setF({ ...f, system_access: v, user_id: v ? f.user_id : "" })} />
            {f.system_access && (
              <Field label="Usuário vinculado *" error={errors.user_id}>
                <Select value={f.user_id || NONE} onValueChange={(v) => setF({ ...f, user_id: v === NONE ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Selecione um usuário</SelectItem>
                    {userOptions.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Toggle label="Auditor autorizado" checked={f.authorized} onChange={(v) => setF({ ...f, authorized: v })} />
            <Toggle label="Auditor ativo" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
          </div>
          <div className="sm:col-span-2">
            <Field label={hasPin ? "PIN personalizado (já definido — preencha para trocar)" : "PIN personalizado (opcional)"} error={errors.pin} htmlFor="a-pin">
              <Input id="a-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8} value={f.pin} disabled={clearPin}
                onChange={(e) => setF({ ...f, pin: onlyDigits(e.target.value) })} />
            </Field>
            {hasPin && (
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={clearPin} onChange={(e) => setClearPin(e.target.checked)} /> Remover PIN personalizado
              </label>
            )}
            <p className="mt-1 text-xs text-muted-foreground">O PIN é armazenado de forma criptografada e nunca é exibido.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
