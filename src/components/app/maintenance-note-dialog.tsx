import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteMaintNoteFn, updateMaintNote } from "@/lib/maintenance.functions";
import { formatDate, friendlyError } from "@/lib/format";
import { sectorsQuery, unitsQuery } from "@/lib/queries";
import { NOTE_PRIORITY, NOTE_STATUS, useSignedUrls, type MaintNote } from "@/lib/maintenance";
import { ConfirmAction } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export async function deleteMaintNote(note: MaintNote) {
  // O servidor apaga a nota (as imagens saem em cascata) e os arquivos das fotos.
  await deleteMaintNoteFn({ data: { id: note.id } });
}

/** Ver / Editar / Excluir buttons for a note row. */
export function NoteRowActions({ note, manage, onOpen }: { note: MaintNote; manage: boolean; onOpen: (n: MaintNote, edit: boolean) => void }) {
  const qc = useQueryClient();
  return (
    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Button size="icon" variant="ghost" title="Ver" aria-label="Ver" onClick={() => onOpen(note, false)}><Eye className="size-4" /></Button>
      {manage && <>
        <Button size="icon" variant="ghost" title="Editar" aria-label="Editar" onClick={() => onOpen(note, true)}><Pencil className="size-4" /></Button>
        <ConfirmAction destructive title={`Excluir a nota ${note.note_number}?`} description="A nota e suas imagens serão apagadas definitivamente." confirmLabel="Excluir"
          onConfirm={async () => {
            try { await deleteMaintNote(note); toast.success("Nota excluída."); await qc.invalidateQueries({ queryKey: ["maint-notes"] }); }
            catch (e) { toast.error(friendlyError(e as Error)); }
          }}
          trigger={(open) => <Button size="icon" variant="ghost" className="text-destructive" title="Excluir" aria-label="Excluir" onClick={open}><Trash2 className="size-4" /></Button>} />
      </>}
    </div>
  );
}

const initial = (n: MaintNote) => ({
  note_date: n.note_date, note_time: n.note_time.slice(0, 5), requester_name: n.requester_name, unit_id: n.unit_id, sector_id: n.sector_id,
  description: n.description, status: n.status, priority: n.priority, assignee_name: n.assignee_name ?? "", due_date: n.due_date ?? "", resolution: n.resolution ?? "",
});

export function NoteDialog({ note, manage, startEditing, onClose }: { note: MaintNote; manage: boolean; startEditing: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const [editing, setEditing] = useState(manage && startEditing);
  const [f, setF] = useState(() => initial(note));
  const [images, setImages] = useState(note.maintenance_note_images);
  const [busy, setBusy] = useState(false);
  const paths = images.map((i) => i.storage_path);
  const urls = useSignedUrls(note.maintenance_note_images.map((i) => i.storage_path));
  const dis = !editing;
  const unitSectors = (sectors.data ?? []).filter((s) => s.unit_id === f.unit_id && (s.active || s.id === note.sector_id));

  const save = async () => {
    if (f.requester_name.trim().length < 2) return toast.error("Informe quem está solicitando.");
    if (f.description.trim().length < 5) return toast.error("Descreva a necessidade (mínimo 5 caracteres).");
    const unit = units.data?.find((u) => u.id === f.unit_id);
    const sector = sectors.data?.find((s) => s.id === f.sector_id && s.unit_id === f.unit_id);
    if (!unit || !sector) return toast.error("Selecione a unidade e o setor.");
    setBusy(true);
    const removed = note.maintenance_note_images.filter((i) => !images.some((k) => k.id === i.id));
    try {
      await updateMaintNote({ data: {
        id: note.id, note_date: f.note_date, note_time: f.note_time, requester_name: f.requester_name.trim(),
        unit_id: unit.id, sector_id: sector.id, description: f.description.trim(),
        status: f.status as never, priority: f.priority as never, assignee_name: f.assignee_name.trim() || null,
        due_date: f.due_date || null, resolution: f.resolution.trim() || null, removedImageIds: removed.map((i) => i.id),
      } });
    } catch (error) {
      return toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
    toast.success("Nota atualizada.");
    await qc.invalidateQueries({ queryKey: ["maint-notes"] });
    onClose();
  };
  const remove = async () => {
    try { await deleteMaintNote(note); } catch (e) { return void toast.error(friendlyError(e as Error)); }
    toast.success("Nota excluída.");
    await qc.invalidateQueries({ queryKey: ["maint-notes"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="management-theme max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{note.note_number} · {editing ? "Editar nota" : `${note.unit_name} / ${note.sector_name}`}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Registrada em {formatDate(note.created_at)} {note.source === "QR" ? "(via QR Code)" : "(pelo sistema)"}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label>Data</Label><Input disabled={dis} type="date" value={f.note_date} onChange={(e) => setF({ ...f, note_date: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Hora</Label><Input disabled={dis} type="time" value={f.note_time} onChange={(e) => setF({ ...f, note_time: e.target.value })} /></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label>Quem está solicitando</Label><Input disabled={dis} maxLength={120} value={f.requester_name} onChange={(e) => setF({ ...f, requester_name: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Unidade</Label>
            <Select disabled={dis} value={f.unit_id} onValueChange={(v) => setF({ ...f, unit_id: v, sector_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{(units.data ?? []).filter((u) => u.active || u.id === note.unit_id).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid gap-1.5"><Label>Setor</Label>
            <Select disabled={dis} value={f.sector_id} onValueChange={(v) => setF({ ...f, sector_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{unitSectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        <div className="grid gap-1.5"><Label>Descrição</Label><Textarea disabled={dis} rows={3} maxLength={3000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        {paths.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img) => (
              <div key={img.id} className="relative size-24 overflow-hidden rounded-md border border-border">
                {urls.data?.[img.storage_path]
                  ? <a href={urls.data[img.storage_path]} target="_blank" rel="noreferrer"><img src={urls.data[img.storage_path]} alt="Imagem da nota" className="size-full object-cover" /></a>
                  : <div className="size-full animate-pulse bg-muted" />}
                {editing && <button type="button" title="Remover imagem" onClick={() => setImages(images.filter((i) => i.id !== img.id))}
                  className="absolute right-1 top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"><X className="size-3" /></button>}
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label>Situação</Label>
            <Select disabled={dis} value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTE_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid gap-1.5"><Label>Prioridade</Label>
            <Select disabled={dis} value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NOTE_PRIORITY.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid gap-1.5"><Label>Responsável pelo serviço</Label><Input disabled={dis} value={f.assignee_name} maxLength={120} onChange={(e) => setF({ ...f, assignee_name: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Prazo</Label><Input disabled={dis} type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
        </div>
        <div className="grid gap-1.5"><Label>Solução / observações</Label><Textarea disabled={dis} rows={3} value={f.resolution} onChange={(e) => setF({ ...f, resolution: e.target.value })} /></div>
        {note.completed_at && <p className="text-xs text-muted-foreground">Concluída em {formatDate(note.completed_at)}</p>}
        {manage && (
          <DialogFooter className="gap-2 sm:justify-between">
            <ConfirmAction destructive title="Excluir nota?" description="A nota e suas imagens serão apagadas definitivamente." confirmLabel="Excluir" onConfirm={remove}
              trigger={(open) => <Button variant="ghost" className="text-destructive" onClick={open}><Trash2 className="size-4" /> Excluir</Button>} />
            {editing ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setF(initial(note)); setImages(note.maintenance_note_images); setEditing(false); }}>Cancelar</Button>
                <Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
              </div>
            ) : <Button onClick={() => setEditing(true)}><Pencil className="size-4" /> Editar</Button>}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
