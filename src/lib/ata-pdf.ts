// Gera a ata do Comitê 5S como arquivo PDF no próprio navegador.
// O nome do arquivo é controlado por nós (download com atributo `download`),
// porque o nome sugerido pelo "Salvar como PDF" do navegador vem do título da
// aba — e dentro da pré-visualização da Lovable esse título não é controlável.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  ACTION_STATUS, MEETING_STATUS, MEETING_TYPES,
  type Meeting, type MeetingAction, type Participant,
} from "@/lib/meetings";

export type AtaFields = Pick<
  Meeting,
  | "title" | "meeting_type" | "topics" | "meeting_date" | "start_time" | "end_time"
  | "location" | "facilitator_name" | "secretary_name" | "objective" | "agenda"
  | "discussion" | "previous_followup" | "notes" | "next_meeting_date" | "status"
>;

export type AtaPdfInput = {
  meeting: AtaFields;
  number: string;
  unitName: string | null;
  participants: Participant[];
  actions: MeetingAction[];
};

const PAGE = { w: 595.274, h: 841.89 };
const M = { left: 46, right: 46, top: 62, bottom: 58 };
const CW = PAGE.w - M.left - M.right;

const ORANGE = rgb(236 / 255, 111 / 255, 0);
const INK = rgb(0.13, 0.14, 0.17);
const GRAY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.80, 0.82, 0.85);
const SOFT = rgb(0.955, 0.96, 0.97);
const ROW = rgb(0.985, 0.987, 0.99);
const BOX = rgb(0.988, 0.99, 0.994);

const LABEL_SIZE = 7.2;
const VALUE_SIZE = 9.5;
const LINE_H = VALUE_SIZE * 1.32;

/** Caracteres fora do Latin-1 que a fonte padrão do PDF ainda sabe desenhar. */
const EXTRA = "–—‘’‛“”„•·†‡€™‹›ŒœŠšŸŽžƒˆ˜‰′″";
const safe = (t: unknown) =>
  Array.from(String(t ?? ""))
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code < 32 || code === 127) return " ";
      return code <= 0xff || EXTRA.includes(ch) ? ch : "";
    })
    .join("");

const dash = (v?: string | null) => {
  const s = safe(v ?? "").trim();
  return s === "" ? "—" : s;
};
const timeLabel = (v?: string | null) => (v ? safe(v).slice(0, 5) : "—");

const dateLabel = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

const money = (v: number | null) =>
  v === null || Number.isNaN(v) ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Nome do arquivo: "Ata de Reunião - Comitê 5S - 22-10-2026.pdf" */
export const ataPdfFileName = (meetingDate?: string | null) => {
  let stamp = "";
  if (meetingDate) {
    const d = new Date(`${meetingDate}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      stamp = ` - ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}`;
    }
  }
  return `Ata de Reunião - Comitê 5S${stamp}.pdf`;
};

function wrapText(text: unknown, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const raw of safe(text).replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { out.push(""); continue; }
    let cur = "";
    for (const word of line.split(/\s+/)) {
      const test = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxW) { cur = test; continue; }
      if (cur) { out.push(cur); cur = ""; }
      if (font.widthOfTextAtSize(word, size) <= maxW) { cur = word; continue; }
      let chunk = "";
      for (const ch of Array.from(word)) {
        if (font.widthOfTextAtSize(chunk + ch, size) <= maxW) chunk += ch;
        else { if (chunk) out.push(chunk); chunk = ch; }
      }
      cur = chunk;
    }
    if (cur) out.push(cur);
  }
  return out;
}

const cut = (txt: string, font: PDFFont, size: number, maxW: number) => {
  let t = safe(txt);
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1);
  return `${t}…`;
};

class Pdf {
  private doc!: PDFDocument;
  private reg!: PDFFont;
  private bold!: PDFFont;
  private page!: PDFPage;
  private y = PAGE.h - M.top;
  private footerText = "";

  static async create(footerText: string) {
    const p = new Pdf();
    p.doc = await PDFDocument.create();
    p.reg = await p.doc.embedFont(StandardFonts.Helvetica);
    p.bold = await p.doc.embedFont(StandardFonts.HelveticaBold);
    p.footerText = footerText;
    p.addPage();
    return p;
  }

  private addPage() {
    this.page = this.doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - M.top;
    this.page.drawRectangle({ x: 0, y: PAGE.h - 5, width: PAGE.w, height: 5, color: ORANGE });
  }

  private ensure(h: number) {
    if (this.y - h < M.bottom) this.addPage();
  }

  private rule() {
    this.ensure(12);
    this.page.drawLine({ start: { x: M.left, y: this.y }, end: { x: PAGE.w - M.right, y: this.y }, thickness: 0.7, color: LINE });
    this.y -= 10;
  }

  private paragraph(text: unknown, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; w?: number; gapBefore?: number; gapAfter?: number } = {}) {
    const size = opts.size ?? VALUE_SIZE;
    const font = opts.bold ? this.bold : this.reg;
    const color = opts.color ?? INK;
    const x = opts.x ?? M.left;
    const w = opts.w ?? CW;
    const leading = size * 1.35;
    const lines = wrapText(text, font, size, w);
    // Garante só o começo do bloco: um texto longo pode continuar na página seguinte.
    this.ensure((opts.gapBefore ?? 0) + Math.min(lines.length, 2) * leading);
    this.y -= opts.gapBefore ?? 0;
    for (const ln of lines) {
      if (this.y - leading < M.bottom) this.addPage();
      if (ln) this.page.drawText(ln, { x, y: this.y - size, size, font, color });
      this.y -= leading;
    }
    this.y -= opts.gapAfter ?? 0;
  }

  /** Altura de um bloco de texto corrido (mesma conta feita em `paragraph`). */
  private textHeight(text: unknown, font: PDFFont, size: number, w: number) {
    return wrapText(text, font, size, w).length * size * 1.35;
  }

  private sectionTitle(n: number, title: string) {
    this.ensure(48);
    this.y -= 18;
    this.page.drawRectangle({ x: M.left, y: this.y - 1, width: 3.5, height: 12, color: ORANGE });
    this.page.drawText(`${n}.  ${title.toUpperCase()}`, { x: M.left + 11, y: this.y, size: 10.5, font: this.bold, color: INK });
    this.y -= 15;
    this.page.drawLine({ start: { x: M.left, y: this.y + 5 }, end: { x: PAGE.w - M.right, y: this.y + 5 }, thickness: 0.6, color: LINE });
    this.y -= 8;
  }

  /** Desenha rótulo + valor começando em `top` e devolve a altura consumida. */
  private fieldAt(label: string, value: unknown, x: number, w: number, top: number) {
    this.page.drawText(safe(label).toUpperCase(), { x, y: top - LABEL_SIZE, size: LABEL_SIZE, font: this.bold, color: GRAY });
    const lines = wrapText(value, this.reg, VALUE_SIZE, w);
    let y = top - 12;
    for (const ln of lines) {
      if (ln) this.page.drawText(ln, { x, y: y - VALUE_SIZE, size: VALUE_SIZE, font: this.reg, color: INK });
      y -= LINE_H;
    }
    return top - y;
  }

  private fieldHeight(value: unknown, w: number) {
    return 12 + wrapText(value, this.reg, VALUE_SIZE, w).length * LINE_H + 6;
  }

  /** Campo ocupando a largura toda (pode continuar na página seguinte). */
  private field(label: string, value: unknown, opts: { x?: number; w?: number } = {}) {
    const x = opts.x ?? M.left;
    const w = opts.w ?? CW;
    const lines = wrapText(value, this.reg, VALUE_SIZE, w);
    this.ensure(12 + Math.min(lines.length, 2) * LINE_H);
    this.page.drawText(safe(label).toUpperCase(), { x, y: this.y - LABEL_SIZE, size: LABEL_SIZE, font: this.bold, color: GRAY });
    this.y -= 12;
    for (const ln of lines) {
      if (this.y - LINE_H < M.bottom) this.addPage();
      if (ln) this.page.drawText(ln, { x, y: this.y - VALUE_SIZE, size: VALUE_SIZE, font: this.reg, color: INK });
      this.y -= LINE_H;
    }
    this.y -= 8;
  }

  private gridHeight(items: { label: string; value: string }[], w: number) {
    const colW = (w - 18) / 2;
    let total = 0;
    for (let i = 0; i < items.length; i += 2) {
      const a = items[i]!;
      const b = items[i + 1];
      total += Math.max(
        this.fieldHeight(a.value, colW),
        b ? this.fieldHeight(b.value, colW) : 0,
      );
    }
    return total;
  }

  /** Campos em duas colunas alinhadas. */
  private grid(items: { label: string; value: string }[], opts: { x?: number; w?: number } = {}) {
    const x0 = opts.x ?? M.left;
    const w = opts.w ?? CW;
    const gap = 18;
    const colW = (w - gap) / 2;
    for (let i = 0; i < items.length; i += 2) {
      const a = items[i]!;
      const b = items[i + 1];
      const h = Math.max(
        this.fieldHeight(a.value, colW),
        b ? this.fieldHeight(b.value, colW) : 0,
      );
      this.ensure(h);
      const top = this.y;
      this.fieldAt(a.label, a.value, x0, colW, top);
      if (b) this.fieldAt(b.label, b.value, x0 + colW + gap, colW, top);
      this.y = top - h;
    }
  }

  private table(headers: string[], widths: number[], rows: string[][]) {
    const gap = 8;
    const cols = widths.map((p) => (p / 100) * (CW - gap * (widths.length - 1)));
    const rowH = 16;
    this.ensure(rowH + 4);
    this.page.drawRectangle({ x: M.left, y: this.y - rowH + 6, width: CW, height: rowH - 3, color: SOFT });
    let x = M.left + 5;
    headers.forEach((hd, i) => {
      this.page.drawText(cut(hd.toUpperCase(), this.bold, 7.4, cols[i]! - 6), { x, y: this.y - rowH + 10, size: 7.4, font: this.bold, color: GRAY });
      x += cols[i]! + gap;
    });
    this.y -= rowH;
    rows.forEach((row, ri) => {
      this.ensure(rowH + 4);
      if (ri % 2 === 1) this.page.drawRectangle({ x: M.left, y: this.y - rowH + 6, width: CW, height: rowH - 3, color: ROW });
      let cx = M.left + 5;
      row.forEach((cell, i) => {
        this.page.drawText(cut(cell, this.reg, 9, cols[i]! - 6), { x: cx, y: this.y - rowH + 10, size: 9, font: this.reg, color: INK });
        cx += cols[i]! + gap;
      });
      this.y -= rowH;
      this.page.drawLine({ start: { x: M.left, y: this.y + 3 }, end: { x: PAGE.w - M.right, y: this.y + 3 }, thickness: 0.4, color: LINE });
    });
    this.y -= 10;
  }

  private actionBox(index: number, a: MeetingAction) {
    const pad = 12;
    const innerW = CW - pad * 2;
    const what = dash(a.what) + (a.topic ? `  ·  ${safe(a.topic)}` : "");
    const whatH = this.textHeight(what, this.bold, 10.5, innerW);
    const items = [
      { label: "Por quê", value: dash(a.why) },
      { label: "Onde", value: dash(a.where_text) },
      { label: "Quem", value: dash(a.who_name) },
      { label: "Quando", value: dateLabel(a.when_date) },
      { label: "Como", value: dash(a.how) },
      { label: "Custo estimado", value: money(a.how_much) },
      { label: "Assunto", value: dash(a.topic) },
      { label: "Situação no plano de ação", value: ACTION_STATUS[a.status] ?? safe(a.status) },
    ];
    const gridH = this.gridHeight(items, innerW);
    const h = 26 + whatH + 4 + gridH + pad;
    this.ensure(h + 8);
    const top = this.y;
    this.page.drawRectangle({ x: M.left, y: top - h, width: CW, height: h, color: BOX });
    this.page.drawRectangle({ x: M.left, y: top - 2.5, width: CW, height: 2.5, color: ORANGE });
    this.page.drawText(`DELIBERAÇÃO ${index}`, { x: M.left + pad, y: top - 15, size: 7.4, font: this.bold, color: ORANGE });
    this.y = top - 26;
    this.paragraph(what, { size: 10.5, bold: true, x: M.left + pad, w: innerW });
    this.y -= 4;
    this.grid(items, { x: M.left + pad, w: innerW });
    this.y = Math.min(this.y, top - h - 6);
    this.y -= 6;
  }

  async build(input: AtaPdfInput, fileName: string) {
    const { meeting, participants, actions } = input;
    this.doc.setTitle(fileName.replace(/\.pdf$/, ""));
    this.doc.setSubject("Ata de reunião do Comitê 5S");
    this.doc.setCreator("Prestek 5S — Gestão e Auditoria 5S");
    this.doc.setProducer("Prestek 5S");

    // Cabeçalho do documento
    this.page.drawText("PRESTEK", { x: M.left, y: this.y - 11, size: 12, font: this.bold, color: INK });
    this.page.drawText("Gestão e Auditoria 5S", { x: M.left, y: this.y - 23, size: 8, font: this.reg, color: GRAY });
    const num = safe(input.number);
    if (num) {
      this.page.drawText(num, { x: PAGE.w - M.right - this.bold.widthOfTextAtSize(num, 10), y: this.y - 11, size: 10, font: this.bold, color: GRAY });
    }
    this.y -= 34;
    this.paragraph("ATA DE REUNIÃO — COMITÊ 5S", { size: 16, bold: true, gapAfter: 2 });
    this.paragraph(
      `${dateLabel(meeting.meeting_date)}  ·  ${timeLabel(meeting.start_time)} às ${timeLabel(meeting.end_time)}  ·  ${dash(meeting.location)}`,
      { size: 9, color: GRAY },
    );
    this.y -= 2;
    this.rule();

    // 1. Identificação
    this.sectionTitle(1, "Identificação");
    this.paragraph(dash(meeting.title), { size: 12, bold: true, gapAfter: 4 });
    this.grid([
      { label: "Tipo de reunião", value: MEETING_TYPES[meeting.meeting_type] ?? dash(meeting.meeting_type) },
      { label: "Situação", value: MEETING_STATUS[meeting.status] ?? dash(meeting.status) },
      { label: "Data", value: dateLabel(meeting.meeting_date) },
      { label: "Horário", value: `${timeLabel(meeting.start_time)} às ${timeLabel(meeting.end_time)}` },
      { label: "Unidade", value: dash(input.unitName) },
      { label: "Local / formato", value: dash(meeting.location) },
      { label: "Coordenador da reunião", value: dash(meeting.facilitator_name) },
      { label: "Secretário (redator da ata)", value: dash(meeting.secretary_name) },
    ]);
    this.field("Assuntos tratados", meeting.topics?.length ? meeting.topics.join("   ·   ") : "—");

    // 2. Participantes
    this.sectionTitle(2, "Participantes");
    if (!participants.length) this.paragraph("Nenhum participante registrado.", { color: GRAY });
    else {
      this.table(
        ["Nome", "Função na reunião", "Presente"],
        [50, 32, 18],
        participants.map((p) => [safe(p.name), p.role_in_meeting ? safe(p.role_in_meeting) : "—", p.present ? "Sim" : "Não"]),
      );
      this.paragraph(`${participants.filter((p) => p.present).length} presente(s) de ${participants.length}.`, { size: 8.5, color: GRAY });
    }

    // 3. Pauta e registro
    this.sectionTitle(3, "Pauta e registro");
    this.field("Objetivo da reunião", dash(meeting.objective));
    this.field("Pauta (itens a tratar)", dash(meeting.agenda));
    this.field("Acompanhamento da reunião anterior", dash(meeting.previous_followup));
    this.field("Discussões e principais pontos", dash(meeting.discussion));

    // 4. Deliberações e encaminhamentos
    this.sectionTitle(4, "Deliberações e encaminhamentos");
    if (!actions.length) this.paragraph("Nenhuma deliberação registrada.", { color: GRAY });
    else actions.forEach((a, i) => this.actionBox(i + 1, a));

    // 5. Encerramento
    this.sectionTitle(5, "Encerramento");
    this.field("Observações gerais", dash(meeting.notes));
    this.field("Próxima reunião", dateLabel(meeting.next_meeting_date));

    const presentNames = participants.filter((p) => p.present).map((p) => safe(p.name));
    if (presentNames.length) {
      this.y -= 16;
      const gap = 24;
      const per = 2;
      const colW = (CW - gap * (per - 1)) / per;
      for (let i = 0; i < presentNames.length; i += per) {
        const row = presentNames.slice(i, i + per);
        this.ensure(48);
        const top = this.y;
        row.forEach((nm, k) => {
          const x = M.left + k * (colW + gap);
          this.page.drawLine({ start: { x, y: top - 14 }, end: { x: x + colW - 12, y: top - 14 }, thickness: 0.7, color: GRAY });
          this.page.drawText(cut(nm, this.reg, 8.5, colW - 12), { x, y: top - 26, size: 8.5, font: this.reg, color: INK });
        });
        this.y = top - 44;
      }
    }

    // Rodapé com numeração
    const pages = this.doc.getPages();
    pages.forEach((pg, i) => {
      pg.drawLine({ start: { x: M.left, y: M.bottom - 10 }, end: { x: PAGE.w - M.right, y: M.bottom - 10 }, thickness: 0.5, color: LINE });
      pg.drawText(cut(this.footerText, this.reg, 7.2, CW - 90), { x: M.left, y: M.bottom - 22, size: 7.2, font: this.reg, color: GRAY });
      const lbl = `Página ${i + 1} de ${pages.length}`;
      pg.drawText(lbl, { x: PAGE.w - M.right - this.reg.widthOfTextAtSize(lbl, 7.2), y: M.bottom - 22, size: 7.2, font: this.reg, color: GRAY });
    });

    return this.doc.save();
  }
}

export async function downloadAtaPdf(input: AtaPdfInput) {
  const fileName = ataPdfFileName(input.meeting.meeting_date);
  const generated = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const pdf = await Pdf.create(`Prestek 5S · ${input.number || "Ata"} · gerado em ${generated}`);
  const bytes = await pdf.build(input, fileName);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return fileName;
}
