import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { compressImage, uploadWithProgress } from "@/lib/image";
import { createMaintNote, createMaintNoteQr, maintUploadUrls, MAX_NOTE_IMAGES } from "@/lib/maintenance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Opt = { id: string; name: string; active: boolean };
type SectorOpt = Opt & { unit_id: string };
export type MaintFormMode =
  | { kind: "internal"; units: Opt[]; sectors: SectorOpt[]; defaultName?: string }
  | { kind: "qr"; token: string; unitName: string; sectorName: string };

const pad = (n: number) => String(n).padStart(2, "0");

export function MaintenanceForm({ mode, onDone }: { mode: MaintFormMode; onDone?: (number: string) => void }) {
  const upload = useServerFn(maintUploadUrls);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState(mode.kind === "internal" ? mode.defaultName ?? "" : "");
  const [unitId, setUnitId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const resetClock = () => {
    const d = new Date();
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };
  useEffect(resetClock, []);
  useEffect(() => { if (mode.kind === "internal" && !name && mode.defaultName) setName(mode.defaultName); }, [mode, name]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const units = mode.kind === "internal" ? mode.units.filter((u) => u.active) : [];
  const sectors = mode.kind === "internal" ? mode.sectors.filter((s) => s.active && s.unit_id === unitId) : [];

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const imgs = [...list].filter((f) => f.type.startsWith("image/"));
    setFiles((cur) => {
      const next = [...cur, ...imgs];
      if (next.length > MAX_NOTE_IMAGES) toast.warning(`Máximo de ${MAX_NOTE_IMAGES} imagens por nota.`);
      return next.slice(0, MAX_NOTE_IMAGES);
    });
  };

  const submit = async () => {
    if (name.trim().length < 2) return toast.error("Informe quem está solicitando.");
    if (mode.kind === "internal" && (!unitId || !sectorId)) return toast.error("Selecione a unidade e o setor.");
    if (desc.trim().length < 5) return toast.error("Descreva a necessidade do setor.");
    setBusy(true);
    try {
      const fields = { requester: name, date: date || null, time: time || null, description: desc };
      const r = mode.kind === "qr"
        ? await createMaintNoteQr({ data: { ...fields, token: mode.token } })
        : await createMaintNote({ data: { ...fields, sectorId } });
      if (!r?.ok) throw new Error(r?.error ?? "Não foi possível abrir a nota.");
      if (files.length) {
        const urls = await upload({ data: { noteId: r.id!, token: r.upload_token!, count: files.length } });
        for (let i = 0; i < files.length; i++) {
          setProgress(`Enviando imagem ${i + 1} de ${files.length}…`);
          const blob = await compressImage(files[i]!);
          await uploadWithProgress(urls[i]!.signedUrl, blob, () => {});
        }
      }
      toast.success(`Nota ${r.number} aberta com sucesso.`);
      setDesc(""); setFiles([]); setUnitId(""); setSectorId(""); resetClock();
      onDone?.(r.number!);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir a nota.");
    } finally {
      setBusy(false); setProgress("");
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5"><Label>Data</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label>Hora</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      </div>
      <div className="grid gap-1.5">
        <Label>Quem está solicitando</Label>
        <Input value={name} maxLength={120} placeholder="Seu nome" onChange={(e) => setName(e.target.value)} />
      </div>
      {mode.kind === "internal" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Unidade</Label>
            <Select value={unitId} onValueChange={(v) => { setUnitId(v); setSectorId(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
              <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Setor</Label>
            <Select value={sectorId} onValueChange={setSectorId} disabled={!unitId}>
              <SelectTrigger><SelectValue placeholder={unitId ? "Selecione o setor" : "Escolha a unidade antes"} /></SelectTrigger>
              <SelectContent>{sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label>Unidade</Label><Input value={mode.unitName} readOnly disabled /></div>
          <div className="grid gap-1.5"><Label>Setor</Label><Input value={mode.sectorName} readOnly disabled /></div>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label>Descrição (necessidade do setor)</Label>
        <Textarea rows={4} maxLength={3000} value={desc} placeholder="Ex.: Prateleira solta no almoxarifado, precisa ser fixada." onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>Imagens (opcional, até {MAX_NOTE_IMAGES})</Label>
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={src} className="relative size-20 overflow-hidden rounded-md border border-border">
              <img src={src} alt={`Imagem ${i + 1}`} className="size-full object-cover" />
              <button type="button" aria-label="Remover imagem" onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-background/90 text-foreground">
                <X className="size-3" />
              </button>
            </div>
          ))}
          {files.length < MAX_NOTE_IMAGES && (
            <label className="grid size-20 cursor-pointer place-items-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted">
              <ImagePlus className="size-5" />
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </div>
      <Button onClick={submit} disabled={busy} className="w-full sm:w-auto sm:justify-self-end">
        {busy && <Loader2 className="size-4 animate-spin" />} {progress || "Abrir nota de manutenção"}
      </Button>
    </div>
  );
}
