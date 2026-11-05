import { formatDateTime } from "@/lib/format";

/** A4 report header. The area on the left is reserved for the Prestek logo. */
export function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center gap-4 border-b-2 border-primary pb-3">
      <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">P5S</div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-bold tracking-tight">PRESTEK · Programa 5S</p>
        <h1 className="font-display text-lg font-bold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <p className="hidden text-right text-[10px] text-muted-foreground sm:block print:block">Gerado em<br />{formatDateTime(new Date().toISOString())}</p>
    </header>
  );
}
