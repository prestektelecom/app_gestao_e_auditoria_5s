import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveSector, saveUnit, setActive } from "@/lib/registry.functions";
import { friendlyError, UF_LIST } from "@/lib/format";
import type { Sector, Unit } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function useInvalidateRegistry() {
  const qc = useQueryClient();
  return () => Promise.all(["units", "sectors", "auditors", "users", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function UnitDialog({ open, onOpenChange, unit }: { open: boolean; onOpenChange: (o: boolean) => void; unit?: Unit | null }) {
  const invalidate = useInvalidateRegistry();
  const [f, setF] = useState({ name: "", code: "", address: "", city: "", state: "", active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setErrors({});
      setF({
        name: unit?.name ?? "", code: unit?.code ?? "", address: unit?.address ?? "",
        city: unit?.city ?? "", state: unit?.state ?? "", active: unit?.active ?? true,
      });
    }
  }, [open, unit]);

  async function save() {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Nome da unidade é obrigatório.";
    if (f.name.length > 120) e.name = "Máximo de 120 caracteres.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const payload = {
      name: f.name.trim(), code: f.code.trim() || null, address: f.address.trim() || null,
      city: f.city.trim() || null, state: f.state || null, active: f.active,
    };
    try {
      await saveUnit({ data: { ...payload, ...(unit ? { id: unit.id } : {}) } });
    } catch (error) {
      return toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
    toast.success(unit ? "Unidade atualizada." : "Unidade cadastrada.");
    await invalidate();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{unit ? "Editar unidade" : "Nova unidade"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Nome da Unidade *" error={errors.name} htmlFor="u-name">
            <Input id="u-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código interno" htmlFor="u-code">
              <Input id="u-code" value={f.code} maxLength={30} onChange={(e) => setF({ ...f, code: e.target.value })} />
            </Field>
            <Field label="UF">
              <Select value={f.state || undefined} onValueChange={(v) => setF({ ...f, state: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{UF_LIST.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Endereço" htmlFor="u-addr">
            <Input id="u-addr" value={f.address} maxLength={200} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
          <Field label="Cidade" htmlFor="u-city">
            <Input id="u-city" value={f.city} maxLength={100} onChange={(e) => setF({ ...f, city: e.target.value })} />
          </Field>
          <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            Unidade ativa <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SectorDialog({
  open, onOpenChange, sector, units, defaultUnitId,
}: { open: boolean; onOpenChange: (o: boolean) => void; sector?: Sector | null; units: Unit[]; defaultUnitId?: string }) {
  const invalidate = useInvalidateRegistry();
  const [f, setF] = useState({ name: "", unit_id: "", description: "", active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setErrors({});
      setF({
        name: sector?.name ?? "", unit_id: sector?.unit_id ?? defaultUnitId ?? "",
        description: sector?.description ?? "", active: sector?.active ?? true,
      });
    }
  }, [open, sector, defaultUnitId]);

  const options = units.filter((u) => u.active || u.id === f.unit_id);

  async function save() {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Nome do setor é obrigatório.";
    if (!f.unit_id) e.unit_id = "Selecione a unidade.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const payload = { name: f.name.trim(), unit_id: f.unit_id, description: f.description.trim() || null, active: f.active };
    try {
      await saveSector({ data: { ...payload, ...(sector ? { id: sector.id } : {}) } });
    } catch (error) {
      return toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
    toast.success(sector ? "Setor atualizado." : "Setor cadastrado.");
    await invalidate();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{sector ? "Editar setor" : "Novo setor"}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label="Nome do Setor *" error={errors.name} htmlFor="s-name">
            <Input id="s-name" value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Unidade *" error={errors.unit_id}>
            <Select value={f.unit_id || undefined} onValueChange={(v) => setF({ ...f, unit_id: v })} disabled={!!sector}>
              <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
              <SelectContent>{options.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Descrição" htmlFor="s-desc">
            <Textarea id="s-desc" value={f.description} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            Setor ativo <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export async function toggleActive(table: "units" | "sectors" | "auditors", id: string, active: boolean) {
  try {
    await setActive({ data: { table, id, active } });
  } catch (error) {
    toast.error(friendlyError(error));
    throw error;
  }
  toast.success(active ? "Registro ativado." : "Registro inativado.");
}
