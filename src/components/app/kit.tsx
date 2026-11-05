import { useState, type ReactNode } from "react";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">{subtitle ?? "Prestek 5S"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  label, title, aside, children, className, delay = 0, tape,
}: {
  label?: string; title?: string; aside?: ReactNode; children: ReactNode; className?: string; delay?: number; tape?: boolean;
}) {
  return (
    <section className={cn("panel rise p-5 sm:p-6", className)} style={{ animationDelay: `${delay}ms` }}>
      {(title || aside) && (
        <div className="flex items-center gap-3">
          {label && <span className="font-mono text-[10px] text-muted-foreground">({label})</span>}
          {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
          {aside && <div className="ml-auto">{aside}</div>}
        </div>
      )}
      {tape && <div className="tape-line mt-4 w-32" />}
      <div className={cn(title || aside ? "mt-5" : "")}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, action, compact }: { title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("empty-well grid place-items-center px-4 text-center", compact ? "py-8" : "py-12")}>
      <div className="max-w-[44ch]">
        <p className={cn("font-display font-semibold text-balance", compact ? "text-sm" : "text-lg")}>{title}</p>
        {description && <p className="mt-2 text-sm text-muted-foreground text-pretty">{description}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="grid place-items-center py-12 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

export function StatusBadge({ active, on = "Ativo", off = "Inativo" }: { active: boolean; on?: string; off?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-muted-foreground/50")} />
      {active ? on : off}
    </span>
  );
}

export function YesNo({ value }: { value: boolean }) {
  return <span className={cn("text-xs font-medium", value ? "text-foreground" : "text-muted-foreground")}>{value ? "Sim" : "Não"}</span>;
}

export function ConfirmAction({
  trigger, title, description, confirmLabel = "Confirmar", onConfirm, destructive,
}: {
  trigger: (open: () => void) => ReactNode; title: string; description: string; confirmLabel?: string;
  onConfirm: () => Promise<void> | void; destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try { await onConfirm(); setOpen(false); } finally { setBusy(false); }
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />} {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ComingSoon({ title, description, items }: { title: string; description: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} subtitle="Módulo em preparação" />
      <Panel tape>
        <div className="grid gap-8 py-6 md:grid-cols-[1fr_1fr] md:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <Sparkles className="size-3.5" /> Próximas etapas do projeto
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-balance">{title} será disponibilizado em breve.</h2>
            <p className="mt-3 text-sm text-muted-foreground text-pretty">{description}</p>
          </div>
          <ul className="grid gap-2">
            {items.map((it, i) => (
              <li key={it} className="empty-well flex items-center gap-3 px-4 py-3 text-sm">
                <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                {it}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

export function Restricted() {
  return (
    <Panel>
      <div className="grid place-items-center gap-3 py-16 text-center">
        <Lock className="size-6 text-muted-foreground" />
        <p className="font-display text-lg font-semibold">Acesso restrito</p>
        <p className="max-w-sm text-sm text-muted-foreground">Seu perfil não possui permissão para acessar esta área.</p>
      </div>
    </Panel>
  );
}
