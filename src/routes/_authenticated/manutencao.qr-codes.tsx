import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Download, Printer } from "lucide-react";
import { listQrSectors } from "@/lib/qr.functions";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { unitsQuery } from "@/lib/queries";
import { EmptyState, LoadingBlock, PageHeader, Panel, Restricted } from "@/components/app/kit";
import { usePublicOrigin } from "@/lib/config.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/manutencao/qr-codes")({
  head: () => ({
    meta: [
      { title: "QR Codes de Manutenção — Prestek 5S" },
      { name: "description", content: "QR Codes por setor para abrir notas de manutenção." },
      { property: "og:title", content: "QR Codes de Manutenção — Prestek 5S" },
      { property: "og:description", content: "QR Codes por setor para abrir notas de manutenção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Row = { id: string; name: string; unit_id: string; qr_token: string; active: boolean };
// O endereço vem de PUBLIC_ORIGIN no servidor (nunca da aba atual nem de um domínio fixo).
const qrUrl = (origin: string, token: string) => `${origin}/manutencao/q/${token}`;

function printLabel(unit: string, sector: string, src: string) {
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  w.document.write(`<!doctype html><html><head><title>QR Manutenção ${esc(sector)}</title><style>
    @page { size: A5 portrait; margin: 12mm; }
    body { font-family: Arial, sans-serif; margin: 0; display: flex; justify-content: center; }
    .card { width: 120mm; border: 2px solid #111; border-radius: 6mm; padding: 10mm; text-align: center; }
    .brand { font-size: 26pt; font-weight: 800; letter-spacing: 3px; margin: 0; }
    .prog { font-size: 12pt; letter-spacing: 4px; margin: 2mm 0 0; }
    .title { font-size: 16pt; font-weight: 700; margin: 6mm 0 4mm; padding: 2mm 0; border-top: 3px solid #f07c00; border-bottom: 3px solid #f07c00; }
    img { width: 80mm; height: 80mm; }
    .info { font-size: 13pt; margin: 2mm 0; } .info b { font-weight: 700; }
    .hint { font-size: 11pt; margin-top: 6mm; }
  </style></head><body><div class="card">
    <p class="brand">PRESTEK</p><p class="prog">PROGRAMA 5S</p><p class="title">SOLICITE MANUTENÇÃO</p>
    <img src="${src}" alt="QR" />
    <p class="info"><b>Unidade:</b> ${esc(unit)}</p><p class="info"><b>Setor:</b> ${esc(sector)}</p>
    <p class="hint">Precisa de um reparo ou serviço? Aponte a câmera do celular para o QR Code e abra uma nota de manutenção.</p>
  </div><script>window.onload=()=>{window.print();}</script></body></html>`);
  w.document.close();
}

function SectorQr({ row, unitName }: { row: Row; unitName: string }) {
  const [src, setSrc] = useState("");
  const origin = usePublicOrigin();
  useEffect(() => { if (origin) QRCode.toDataURL(qrUrl(origin, row.qr_token), { width: 512, margin: 1, errorCorrectionLevel: "M" }).then(setSrc); }, [origin, row.qr_token]);
  const download = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = `QR-Manutencao-${unitName}-${row.name}.png`.replace(/[^\w.-]+/g, "_");
    a.click();
  };
  return (
    <div className="panel flex flex-col items-center gap-3 p-4 text-center">
      {src ? <img src={src} alt={`QR manutenção ${row.name}`} className="size-36 rounded-lg bg-card p-1" /> : <div className="size-36" />}
      <p className="font-medium">{row.name}</p>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={download} aria-label="Baixar"><Download className="size-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => printLabel(unitName, row.name, src)} aria-label="Imprimir"><Printer className="size-4" /></Button>
      </div>
    </div>
  );
}

function Page() {
  const { role } = useAuth();
  const units = useQuery(unitsQuery);
  const sectors = useQuery({
    queryKey: ["sectors-qr"],
    queryFn: (): Promise<Row[]> => listQrSectors(),
  });
  const grouped = useMemo(() => (units.data ?? []).filter((u) => u.active)
    .map((u) => ({ unit: u, sectors: (sectors.data ?? []).filter((s) => s.unit_id === u.id && s.active) }))
    .filter((g) => g.sectors.length), [units.data, sectors.data]);

  if (!can(role, "maintenance.qrcodes")) return <Restricted />;
  return (
    <>
      <PageHeader title="QR Codes de Manutenção" subtitle="Imprima e fixe nas paredes de cada setor" />
      {units.isLoading || sectors.isLoading ? <Panel><LoadingBlock /></Panel> : grouped.length === 0 ? (
        <Panel><EmptyState title="Nenhum setor ativo." description="Cadastre unidades e setores para gerar os QR Codes." /></Panel>
      ) : grouped.map((g) => (
        <Panel key={g.unit.id} title={`Unidade ${g.unit.name}`} tape>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.sectors.map((s) => <SectorQr key={s.id} row={s} unitName={g.unit.name} />)}
          </div>
        </Panel>
      ))}
    </>
  );
}
