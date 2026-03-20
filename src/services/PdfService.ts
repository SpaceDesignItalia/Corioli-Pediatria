import jsPDF from "jspdf";
import {
  Patient, Visit, Doctor,
  RichiestaEsameComplementare,
  CertificatoPaziente,
} from "../types/Storage";
import { DoctorService, PreferenceService, VisitService } from "./OfflineServices";

// ─── Layout ──────────────────────────────────────────────────────────────────
const ML = 15;
const MR = 195;
const PW = MR - ML;   // 180 mm
const PAGE_H = 297;
const FOOT_Y = PAGE_H - 14;
const LH = 4.8;

// ─── B&W palette ─────────────────────────────────────────────────────────────
const K0 = [0, 0, 0] as const;
const K30: [number, number, number] = [30, 30, 30];
const K80: [number, number, number] = [80, 80, 80];
const K100: [number, number, number] = [100, 100, 100];
const K140: [number, number, number] = [140, 140, 140];
const K200: [number, number, number] = [200, 200, 200];
const K235: [number, number, number] = [235, 235, 235];
const K240: [number, number, number] = [240, 240, 240];
const K245: [number, number, number] = [245, 245, 245] as const;

interface FooterVisibilityOptions {
  showDoctorPhoneInPdf?: boolean;
  showDoctorEmailInPdf?: boolean;
}

// ─── Sanitizer + utils ────────────────────────────────────────────────────────
function san(t: string): string {
  if (!t) return "";
  const M: Record<number, string> = {
    224: "a'", 232: "e'", 233: "e'", 236: "i'", 242: "o'", 249: "u'",
    192: "A'", 200: "E'", 201: "E'", 204: "I'", 210: "O'", 217: "U'",
  };
  let r = "";
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (M[c]) { r += M[c]; continue; }
    if (c === 195 && i + 1 < t.length) {
      const n = t.charCodeAt(i + 1);
      const U: Record<number, string> = { 160: "a'", 168: "e'", 169: "e'", 172: "i'", 178: "o'", 185: "u'" };
      if (U[n]) { r += U[n]; i++; continue; }
    }
    r += t[i];
  }
  return r;
}

function fd(d: string): string {
  if (!d) return "-";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("it-IT");
}
function formatDateDMY(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function calcAge(dob: string): string {
  if (!dob) return "";
  const b = new Date(dob); if (isNaN(b.getTime())) return "";
  const t = new Date(); let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return String(a);
}
function v(x: string | number | undefined | null, fb = "-"): string {
  return (x === undefined || x === null || String(x).trim() === "") ? fb : String(x);
}

// ─────────────────────────────────────────────────────────────────────────────
export class PdfService {

  private static fCtx: { doctor: Doctor | null; opts: FooterVisibilityOptions } | null = null;

  private static fc(d: jsPDF, c: readonly number[]) { d.setFillColor(c[0], c[1], c[2]); }
  private static dc(d: jsPDF, c: readonly number[]) { d.setDrawColor(c[0], c[1], c[2]); }
  private static tc(d: jsPDF, c: readonly number[]) { d.setTextColor(c[0], c[1], c[2]); }

  // ── page break ───────────────────────────────────────────────────────────────
  private static pb(doc: jsPDF, y: number, need = 30): number {
    if (y + need > FOOT_Y - 8) {
      if (this.fCtx) this.drawFooter(doc, this.fCtx.doctor, this.fCtx.opts);
      doc.addPage(); return 18;
    }
    return y;
  }

  // ── multiline text block ─────────────────────────────────────────────────────
  private static block(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    maxW: number,
    lh = LH,
    textStyle?: { font?: "helvetica" | "times"; style?: "normal" | "bold" | "italic"; fontSize?: number; color?: readonly number[] },
  ): number {
    if (!text?.trim()) return y;
    const lines: string[] = doc.splitTextToSize(san(text), maxW);
    for (const line of lines) {
      y = this.pb(doc, y, lh + 1);
      if (textStyle) {
        doc.setFont(textStyle.font ?? "helvetica", textStyle.style ?? "normal");
        if (textStyle.fontSize != null) doc.setFontSize(textStyle.fontSize);
        if (textStyle.color) this.tc(doc, textStyle.color);
      }
      doc.text(line, x, y);
      y += lh;
    }
    return y;
  }

  // ── horizontal rule ──────────────────────────────────────────────────────────
  private static rule(doc: jsPDF, y: number, x1 = ML, x2 = MR, lw = 0.2) {
    this.dc(doc, K200); doc.setLineWidth(lw); doc.line(x1, y, x2, y);
  }

  // ── TABLE ENGINE ─────────────────────────────────────────────────────────────
  private static table(
    doc: jsPDF, y: number,
    cols: { header: string; w: number }[],
    rows: string[][],
    opts?: { rowH?: number; fontSize?: number; headerFontSize?: number; drawBorders?: boolean },
  ): number {
    const ROW_H = opts?.rowH ?? 7;
    const FONT = opts?.fontSize ?? 8.5;
    const HFONT = opts?.headerFontSize ?? 7.5;
    const PAD = 1.8;
    const drawBorders = opts?.drawBorders !== false;
    const totalW = cols.reduce((s, c) => s + c.w, 0);

    y = this.pb(doc, y, ROW_H * (rows.length + 1) + 4);

    // header
    this.fc(doc, K235); doc.rect(ML, y, totalW, ROW_H, "F");
    if (drawBorders) {
      this.dc(doc, K200); doc.setLineWidth(0.2); doc.rect(ML, y, totalW, ROW_H, "S");
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(HFONT); this.tc(doc, K30);
    let cx = ML;
    cols.forEach(col => {
      if (cx > ML && drawBorders) { this.dc(doc, K200); doc.setLineWidth(0.15); doc.line(cx, y, cx, y + ROW_H); }
      const lines = doc.splitTextToSize(san(col.header), col.w - PAD * 2);
      doc.text(lines[0] ?? '', cx + PAD, y + ROW_H / 2 + HFONT * 0.18, { baseline: "middle" });
      cx += col.w;
    });
    y += ROW_H;

    // rows
    rows.forEach(row => {
      y = this.pb(doc, y, ROW_H + 2);
      if (drawBorders) {
        this.dc(doc, K200); doc.setLineWidth(0.15); doc.rect(ML, y, totalW, ROW_H, "S");
      }
      cx = ML;
      doc.setFont("helvetica", "normal"); doc.setFontSize(FONT); this.tc(doc, K30);
      cols.forEach((col, ci) => {
        if (cx > ML && drawBorders) { this.dc(doc, K200); doc.setLineWidth(0.15); doc.line(cx, y, cx, y + ROW_H); }
        const cellLines = doc.splitTextToSize(san(v(row[ci])), col.w - PAD * 2);
        doc.text(cellLines[0] ?? '', cx + PAD, y + ROW_H / 2 + FONT * 0.18, { baseline: "middle" });
        cx += col.w;
      });
      y += ROW_H;
    });

    return y + 3;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUXOLOGIA: tabella strutturata
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawAuxologicalTable(
    doc: jsPDF,
    y: number,
    params: {
      peso?: number | null;
      percentilePeso?: string | number | null;
      altezza?: number | null;
      percentileAltezza?: string | number | null;
      circonferenzaCranica?: number | null;
      percentileCC?: string | number | null;
      bmi?: number | null;
      percentileBmi?: string | number | null;
      pressioneArteriosa?: string | null;
      stadioTurner?: string | null;
    },
    includeCcAndBmi: boolean,
  ): number {
    const fVal = (x?: string | number | null): string =>
      x == null || String(x).trim() === "" ? "-" : String(x);
    const fPerc = (p?: string | number | null): string => {
      if (p == null) return "-";
      const raw = String(p).trim();
      if (!raw) return "-";
      const normalized = raw.endsWith("°") ? raw.slice(0, -1).trim() : raw;
      return `${normalized}°`;
    };
    const pNum = (p?: string | number | null): number | null => {
      if (p == null) return null;
      const raw = String(p).trim().replace("°", "").replace(",", ".");
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
    };

    const drawPercentileBar = (bx: number, by: number, barW: number, rank: number) => {
      const PAD_L = 2.2;
      const PAD_R = 13;
      const lineX0 = bx + PAD_L;
      const lineX1 = bx + barW - PAD_R;
      const lineW = Math.max(8, lineX1 - lineX0);
      const toX = (val: number): number => lineX0 + (Math.max(0, Math.min(100, val)) / 100) * lineW;
      const midY = by;
      const tickH = 1.2;

      this.dc(doc, K30); doc.setLineWidth(0.3);
      doc.line(lineX0, midY, lineX1, midY);
      doc.line(lineX0, midY - tickH, lineX0, midY + tickH);
      doc.line(lineX1, midY - tickH, lineX1, midY + tickH);
      const x50 = toX(50);
      doc.line(x50, midY - tickH * 1.05, x50, midY + tickH * 1.05);

      const xPat = toX(rank);
      const dSize = 1.2;
      this.fc(doc, K30); this.dc(doc, K30); doc.setLineWidth(0.1);
      doc.moveTo(xPat, midY - dSize);
      doc.lineTo(xPat + dSize, midY);
      doc.lineTo(xPat, midY + dSize);
      doc.lineTo(xPat - dSize, midY);
      doc.lineTo(xPat, midY - dSize);
      (doc as any).fillStroke();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      this.tc(doc, K30);
      doc.text(`${Math.round(rank)}°`, lineX1 + 1.8, midY + 1);
    };

    const pesoItem = {
      label: "Peso",
      value: params.peso != null ? `${params.peso} kg` : "-",
      percentileLabel: fPerc(params.percentilePeso),
      percentileRank: pNum(params.percentilePeso),
    };
    const altezzaItem = {
      label: "Altezza",
      value: params.altezza != null ? `${params.altezza} cm` : "-",
      percentileLabel: fPerc(params.percentileAltezza),
      percentileRank: pNum(params.percentileAltezza),
    };
    const ccItem = {
      label: "C.C.",
      value: params.circonferenzaCranica != null ? `${params.circonferenzaCranica} cm` : "-",
      percentileLabel: fPerc(params.percentileCC),
      percentileRank: pNum(params.percentileCC),
    };
    const bmiItem = {
      label: "BMI",
      value: params.bmi != null ? String(params.bmi) : "-",
      percentileLabel: fPerc(params.percentileBmi),
      percentileRank: pNum(params.percentileBmi),
    };
    const paItem = { label: "P.A.", value: fVal(params.pressioneArteriosa), percentileLabel: "-", percentileRank: null as number | null };
    const turnerItem = { label: "Stadio di Turner", value: fVal(params.stadioTurner), percentileLabel: "-", percentileRank: null as number | null };

    // Impaginazione "3 e 3":
    // - sinistra: misure auxologiche (con percentile), senza BMI
    // - destra: BMI (con percentile) + PA + Turner
    // Questo riduce l'ingombro e mantiene barre/marker coerenti nel proprio blocco.
    const leftItems = includeCcAndBmi ? [altezzaItem, pesoItem, ccItem] : [altezzaItem, pesoItem];
    const rightItems = includeCcAndBmi ? [bmiItem, paItem, turnerItem] : [paItem, turnerItem];

    y = this.heading(doc, y, "Parametri Auxologici");

    const ROW_H = 8;
    const PAD = 1.6;
    const BLOCK_W = PW / 2; // layout "invertito" a due blocchi affiancati
    const COL_A = 26; // parametro
    const COL_B = BLOCK_W - COL_A; // valore (eventuale barra percentile integrata)

    const rowCount = Math.max(leftItems.length, rightItems.length);
    y = this.pb(doc, y, ROW_H * (rowCount + 1) + 6);

    const drawHeaderBlock = (bx: number) => {
      this.fc(doc, K235); doc.rect(bx, y, BLOCK_W, ROW_H, "F");
      this.dc(doc, K200); doc.setLineWidth(0.2); doc.rect(bx, y, BLOCK_W, ROW_H, "S");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.6); this.tc(doc, K30);
      doc.text("Parametro", bx + PAD, y + ROW_H / 2 + 0.4, { baseline: "middle" });
      this.dc(doc, K200); doc.setLineWidth(0.15); doc.line(bx + COL_A, y, bx + COL_A, y + ROW_H);
      doc.text("Valore", bx + COL_A + PAD, y + ROW_H / 2 + 0.4, { baseline: "middle" });
    };

    drawHeaderBlock(ML);
    drawHeaderBlock(ML + BLOCK_W);
    y += ROW_H;

    for (let r = 0; r < rowCount; r++) {
      y = this.pb(doc, y, ROW_H + 2);
      for (let side = 0; side < 2; side++) {
        const row = side === 0 ? leftItems[r] : rightItems[r];
        if (!row) continue;
        const bx = ML + side * BLOCK_W;

        this.dc(doc, K200); doc.setLineWidth(0.15); doc.rect(bx, y, BLOCK_W, ROW_H, "S");
        doc.line(bx + COL_A, y, bx + COL_A, y + ROW_H);

        doc.setFont("helvetica", "bold"); doc.setFontSize(8.1); this.tc(doc, K30);
        const label = doc.splitTextToSize(san(row.label), COL_A - PAD * 2);
        doc.text(label[0] ?? "-", bx + PAD, y + ROW_H / 2 + 0.4, { baseline: "middle" });

        const valueX = bx + COL_A + PAD;
        const valueW = COL_B - PAD * 2;
        const barW = 33;
        const textW = row.percentileRank != null ? Math.max(10, valueW - barW - 2) : valueW;

        doc.setFont("helvetica", "normal"); doc.setFontSize(8.1); this.tc(doc, K30);
        const value = doc.splitTextToSize(san(row.value), textW);
        doc.text(value[0] ?? "-", valueX, y + ROW_H / 2 + 0.4, { baseline: "middle" });

        if (row.percentileRank != null) {
          drawPercentileBar(valueX + textW + 1, y + ROW_H / 2, barW, row.percentileRank);
        } else {
          if (row.percentileLabel !== "-") {
            doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K100);
            doc.text(row.percentileLabel, valueX + textW + 1, y + ROW_H / 2 + 0.4, { baseline: "middle" });
          }
        }
      }
      y += ROW_H;
    }

    return y + 3;
  }

  private static calcBmiFromAuxo(
    peso?: number | null,
    altezzaCm?: number | null,
    fallback?: number | null,
  ): number | null {
    if (peso != null && altezzaCm != null && Number.isFinite(peso) && Number.isFinite(altezzaCm) && altezzaCm > 0) {
      const m = altezzaCm / 100;
      const bmi = peso / (m * m);
      if (Number.isFinite(bmi)) return Number(bmi.toFixed(1));
    }
    if (fallback != null && Number.isFinite(fallback)) return Number(fallback.toFixed(1));
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION HEADING
  // ─────────────────────────────────────────────────────────────────────────────
  private static heading(doc: jsPDF, y: number, text: string): number {
    y = this.pb(doc, y, 12);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); this.tc(doc, K0);
    doc.text(san(text), ML, y);
    this.rule(doc, y + 1.2, ML, ML + doc.getTextWidth(san(text)), 0.4);
    return y + 5.5;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOCUMENT HEADER
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawHeader(
    doc: jsPDF, title: string, subtitle: string,
    doctor: Doctor | null, showDoctor = true
  ): number {
    let y = 16;
    if (showDoctor && doctor) {
      doc.setFont("times", "bold"); doc.setFontSize(14); this.tc(doc, K0);
      doc.text(san(`Dott. ${doctor.nome} ${doctor.cognome}`.toUpperCase()), 105, y, { align: "center" });
      y += 5.5;
      if (doctor.specializzazione) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); this.tc(doc, K80);
        doc.text(san(doctor.specializzazione), 105, y, { align: "center" });
        y += 4.5;
      }
    } else if (showDoctor) {
      doc.setFont("times", "bold"); doc.setFontSize(14); this.tc(doc, K0);
      doc.text("STUDIO MEDICO", 105, y, { align: "center" }); y += 9;
    }
    this.rule(doc, y, ML, MR, 0.5); y += 5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); this.tc(doc, K0);
    doc.text(san(title), 105, y, { align: "center" }); y += 5;
    if (subtitle) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); this.tc(doc, K80);
      doc.text(san(subtitle), 105, y, { align: "center" }); y += 4;
    }
    this.rule(doc, y, ML, MR, 0.3);
    return y + 4;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATIENT BLOCK
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawPatientBlock(
    doc: jsPDF, patient: Patient, visitDate: string,
    y: number, dateLabel = "Data visita"
  ): number {
    const a = calcAge(patient.dataNascita);
    const dob = patient.dataNascita
      ? `${fd(patient.dataNascita)}${a ? `  (${a} anni)` : ""}` : "-";

    const left: { label: string; value: string }[] = [
      { label: "Paziente", value: `${patient.nome} ${patient.cognome}` },
      { label: "Data di nascita", value: dob },
      ...(patient.codiceFiscale?.trim() ? [{ label: "Cod. Fiscale", value: patient.codiceFiscale }] : []),
    ];
    const right: { label: string; value: string }[] = [
      { label: dateLabel, value: fd(visitDate) },
      ...(patient.sesso ? [{ label: "Sesso", value: patient.sesso }] : []),
    ];

    const halfW = PW / 2 - 4;
    let ly = y, ry = y;

    for (const item of left) {
      if (!item.value || item.value === "-") continue;
      ly = this.pb(doc, ly, LH + 1);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); this.tc(doc, K80);
      const lbl = san(item.label) + ": ";
      doc.text(lbl, ML, ly);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); this.tc(doc, K0);
      const lblWidth = doc.getTextWidth(lbl);
      const valueX = ML + lblWidth + 1;
      const vlines = doc.splitTextToSize(san(item.value), halfW - lblWidth - 3);
      doc.text(vlines[0] ?? "", valueX, ly); ly += LH;
      for (let i = 1; i < vlines.length; i++) {
        doc.text(vlines[i], valueX, ly);
        ly += LH;
      }
    }
    for (const item of right) {
      if (!item.value || item.value === "-") continue;
      ry = this.pb(doc, ry, LH + 1);
      const rx = ML + PW / 2 + 4;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); this.tc(doc, K80);
      const lbl = san(item.label) + ": ";
      doc.text(lbl, rx, ry);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); this.tc(doc, K0);
      const lblWidth = doc.getTextWidth(lbl);
      const valueX = rx + lblWidth + 1;
      doc.text(san(item.value), valueX, ry);
      ry += LH;
    }

    y = Math.max(ly, ry) + 2;
    this.rule(doc, y, ML, MR, 0.3);
    return y + 4;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEXT SECTION
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawTextSection(
    doc: jsPDF, y: number, title: string,
    content: string | undefined | null, note?: string
  ): number {
    if (!content?.trim()) return y;
    y = this.pb(doc, y, 14);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); this.tc(doc, K0);
    doc.text(san(title), ML, y);
    this.rule(doc, y + 1.5, ML, MR, 0.25); y += 5.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); this.tc(doc, K30);
    y = this.block(doc, content, ML + 1, y, PW - 2, LH, {
      font: "helvetica", style: "normal", fontSize: 9.5, color: K30,
    });
    if (note) {
      y += 1.5;
      doc.setFont("helvetica", "italic"); doc.setFontSize(7); this.tc(doc, K140);
      y = this.block(doc, note, ML + 1, y, PW - 2, 3.8, {
        font: "helvetica", style: "italic", fontSize: 7, color: K140,
      });
    }
    return y + 4;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FOOTER
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawFooter(doc: jsPDF, doctor: Doctor | null, vis?: FooterVisibilityOptions) {
    this.rule(doc, FOOT_Y, ML + 10, MR - 10, 0.2);
    const parts: string[] = [];
    if (doctor?.ambulatori?.length) {
      const a = doctor.ambulatori.find(x => x.isPrimario) || doctor.ambulatori[0];
      parts.push(san(`${a.nome} - ${a.indirizzo}, ${a.citta}`));
    }
    if (vis?.showDoctorPhoneInPdf !== false && doctor?.telefono) parts.push(`Tel: ${doctor.telefono}`);
    if (vis?.showDoctorEmailInPdf !== false && doctor?.email) parts.push(san(doctor.email));
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); this.tc(doc, K140);
    doc.text(parts.join("   |   "), 105, FOOT_Y + 5, { align: "center" });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PEDIATRIC GROWTH CHART (B&W STYLE)
  // ─────────────────────────────────────────────────────────────────────────────
  private static drawPediatricGrowthChart(params: {
    doc: jsPDF;
    y: number;
    patient: Patient;
    visit: Visit;
    points: Array<{ xIso: string; yCm: number }>;
    arrival?: { xIso: string; yCm: number };
  }): number {
    const { doc, points, arrival } = params;
    const hasAny = (points && points.length > 0) || (arrival && Number.isFinite(arrival.yCm));
    if (!hasAny) return params.y;

    params.y = this.pb(doc, params.y, 80);

    // Title
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); this.tc(doc, K0);
    doc.text("Andamento crescita (Altezza)", 105, params.y, { align: "center" });
    params.y += 6;

    const boxY = params.y;
    const boxX = ML + 10;
    const boxW = PW - 20;
    const boxH = 55;

    // Frame
    this.dc(doc, K200); doc.setLineWidth(0.2);
    doc.rect(boxX, boxY, boxW, boxH, "S");

    const all = arrival
      ? [...points.map(p => ({ ...p })), { xIso: arrival.xIso, yCm: arrival.yCm }]
      : points;

    const xs = all.map(p => new Date(p.xIso).getTime()).filter(t => Number.isFinite(t));
    const ys = all.map(p => p.yCm).filter(v => Number.isFinite(v));

    if (xs.length < 2 || ys.length < 1) return boxY + boxH + 6;

    const minX = Math.min(...xs);
    const maxXRaw = Math.max(...xs);
    const maxX = maxXRaw === minX ? minX + 100000 : maxXRaw;

    const minYRaw = Math.min(...ys);
    const maxYRaw = Math.max(...ys);
    const spanY = Math.max(0.1, maxYRaw - minYRaw);
    const minY = minYRaw - spanY * 0.1;
    const maxY = maxYRaw + spanY * 0.1;
    const spanY2 = Math.max(0.1, maxY - minY);

    const xScale = (t: number) => boxX + ((t - minX) / (maxX - minX)) * boxW;
    const yScale = (v: number) => boxY + boxH - ((v - minY) / spanY2) * boxH;

    // Y Axis Grid
    const yTicks = 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); this.tc(doc, K140);
    this.dc(doc, K235); doc.setLineWidth(0.15);

    for (let i = 0; i <= yTicks; i++) {
      const t = i / yTicks;
      const yVal = minY + (maxY - minY) * t;
      const yPos = yScale(yVal);
      if (i > 0 && i < yTicks) {
        doc.line(boxX, yPos, boxX + boxW, yPos);
      }
      doc.text(`${Math.round(yVal)} cm`, boxX - 1.5, yPos + 2, { align: "right" });
    }

    // X Axis Labels: data completa (dd/mm/aaaa)
    const xTicks = 4;
    for (let i = 0; i < xTicks; i++) {
      const t = xTicks === 1 ? 0 : i / (xTicks - 1);
      const ts = minX + (maxX - minX) * t;
      const xPos = xScale(ts);
      if (i > 0 && i < xTicks - 1) {
        doc.line(xPos, boxY, xPos, boxY + boxH);
      }
      const d = new Date(ts);
      if (!Number.isFinite(d.getTime())) continue;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = String(d.getFullYear());
      // Etichetta singola: dd/mm/aaaa
      doc.setFontSize(5);
      doc.text(`${day}/${month}/${year}`, xPos, boxY + boxH + 7.0, { align: "center" });
    }

    const sortedPoints = [...points].sort((a, b) => new Date(a.xIso).getTime() - new Date(b.xIso).getTime());

    // Line
    this.dc(doc, K0); doc.setLineWidth(0.35);
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const a = sortedPoints[i];
      const b = sortedPoints[i + 1];
      doc.line(xScale(new Date(a.xIso).getTime()), yScale(a.yCm), xScale(new Date(b.xIso).getTime()), yScale(b.yCm));
    }

    // Points
    this.dc(doc, K0); this.fc(doc, K0);
    for (let i = 0; i < sortedPoints.length; i++) {
      const p = sortedPoints[i];
      const cx = xScale(new Date(p.xIso).getTime());
      const cy = yScale(p.yCm);
      const isLast = i === sortedPoints.length - 1;
      if (isLast) {
        doc.circle(cx, cy, 1.2, "FD");
      } else {
        this.dc(doc, K140); this.fc(doc, K235); doc.setLineWidth(0.1);
        doc.circle(cx, cy, 0.9, "FD");
        this.dc(doc, K0); this.fc(doc, K0);
      }
    }

    // Arrival marker (diamond)
    if (arrival && Number.isFinite(arrival.yCm)) {
      const ts = new Date(arrival.xIso).getTime();
      if (Number.isFinite(ts)) {
        const cx = xScale(ts);
        const cy = yScale(arrival.yCm);
        const r = 1.6;
        this.dc(doc, K0); this.fc(doc, K0); doc.setLineWidth(0.1);
        doc.moveTo(cx, cy - r);
        doc.lineTo(cx + r, cy);
        doc.lineTo(cx, cy + r);
        doc.lineTo(cx - r, cy);
        doc.lineTo(cx, cy - r);
        (doc as any).fillStroke();
        // Dashed line connecting last point to arrival
        if (sortedPoints.length > 0) {
          const lp = sortedPoints[sortedPoints.length - 1];
          doc.setLineDashPattern([1, 1], 0);
          this.dc(doc, K80); doc.setLineWidth(0.2);
          doc.line(xScale(new Date(lp.xIso).getTime()), yScale(lp.yCm), cx, cy);
          doc.setLineDashPattern([], 0); // reset
        }
        
        // Nessuna etichetta testuale: lasciamo solo il marker e la linea tratteggiata.
      }
    }

    return boxY + boxH + 16;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════

  static async generatePediatricPDF(
    patient: Patient,
    visit: Visit,
    options?: { includeGrowthChart?: boolean },
  ) {
    const [doctor, prefs] = await Promise.all([DoctorService.getDoctor(), PreferenceService.getPreferences()]);
    const fo: FooterVisibilityOptions = {
      showDoctorPhoneInPdf: prefs?.showDoctorPhoneInPdf as boolean | undefined,
      showDoctorEmailInPdf: prefs?.showDoctorEmailInPdf as boolean | undefined,
    };
    this.fCtx = { doctor, opts: fo };
    const doc = new jsPDF();

    let title = "VISITA PEDIATRICA";
    if (visit.tipo === "bilancio_salute") title = "BILANCIO DI SALUTE";
    else if (visit.tipo === "patologia") title = "VISITA PER PATOLOGIA";
    else if (visit.tipo === "controllo") title = "CONTROLLO PEDIATRICO";
    else if (visit.tipo === "urgenza") title = "VISITA URGENTE";

    let y = this.drawHeader(doc, title, "Referto", doctor);
    y = this.drawPatientBlock(doc, patient, visit.dataVisita, y);

    const ped = visit.pediatria;
    if (ped) {
      if (visit.tipo === "bilancio_salute") {
        const bmiCalc = this.calcBmiFromAuxo(ped.peso, ped.altezza, ped.bmi);
        y = this.drawAuxologicalTable(doc, y, {
          peso: ped.peso,
          percentilePeso: ped.percentilePeso,
          altezza: ped.altezza,
          percentileAltezza: ped.percentileAltezza,
          circonferenzaCranica: ped.circonferenzaCranica,
          percentileCC: ped.percentileCC,
          bmi: bmiCalc,
          percentileBmi: ped.percentileBmi,
          pressioneArteriosa: ped.pressioneArteriosa?.trim() || null,
          stadioTurner: ped.stadioTurner?.trim() || null,
        }, true);
      } else {
        // Manteniamo la tabella "Parametri Auxologici" anche se esistono solo PA/Turner.
        if (ped.peso != null || ped.altezza != null || ped.pressioneArteriosa?.trim() || ped.stadioTurner?.trim()) {
          const bmiCalc = this.calcBmiFromAuxo(ped.peso, ped.altezza, ped.bmi);
          y = this.drawAuxologicalTable(doc, y, {
            peso: ped.peso,
            percentilePeso: ped.percentilePeso,
            altezza: ped.altezza,
            percentileAltezza: ped.percentileAltezza,
            bmi: bmiCalc,
            percentileBmi: ped.percentileBmi,
            pressioneArteriosa: ped.pressioneArteriosa?.trim() || null,
            stadioTurner: ped.stadioTurner?.trim() || null,
          }, false);
        }
      }
    }

    if (visit.anamnesi) y = this.drawTextSection(doc, y, "Anamnesi", visit.anamnesi);
    if (visit.descrizioneClinica) y = this.drawTextSection(doc, y, "Patologica prossima", visit.descrizioneClinica);
    if (visit.esamiObiettivo) y = this.drawTextSection(doc, y, "Visita", visit.esamiObiettivo);

    const conclusioniMerge = [visit.conclusioniDiagnostiche, visit.terapie].filter(Boolean).join('\n\n');
    if (conclusioniMerge) y = this.drawTextSection(doc, y, "Conclusioni e Terapie", conclusioniMerge);

    if (ped?.notePediatriche) y = this.drawTextSection(doc, y, "Note cliniche / Educazione sanitaria", ped.notePediatriche);

    if (options?.includeGrowthChart !== false) {
      try {
        const allVisits = await VisitService.getVisitsByPatientId(patient.id);
        const rawPoints = allVisits
          .filter(v => v?.pediatria?.altezza != null && Number.isFinite(v.pediatria.altezza as number))
          .map(v => ({ xIso: v.dataVisita, yCm: v.pediatria!.altezza as number }));

        if (ped?.altezza != null && Number.isFinite(ped.altezza as number)) {
          rawPoints.push({ xIso: visit.dataVisita, yCm: ped.altezza as number });
        }

        const map = new Map<string, { xIso: string; yCm: number }>();
        for (const p of rawPoints) map.set(`${p.xIso}|${Number(p.yCm).toFixed(2)}`, p);
        const points = Array.from(map.values()).sort((a, b) => new Date(a.xIso).getTime() - new Date(b.xIso).getTime());

        const father = ped?.altezzaPadre ?? patient.altezzaPadre;
        const mother = ped?.altezzaMadre ?? patient.altezzaMadre;
        let arrival: { xIso: string; yCm: number } | undefined = undefined;
        if (father != null && mother != null && Number.isFinite(father) && Number.isFinite(mother) && patient.sesso) {
          const sum = (father as number) + (mother as number);
          const est = patient.sesso === "M" ? (sum + 13) / 2 : (sum - 13) / 2;
          if (Number.isFinite(est)) {
            const d = new Date(visit.dataVisita);
            d.setDate(d.getDate() + 1);
            arrival = { xIso: d.toISOString().slice(0, 10), yCm: est };
          }
        }
        y = this.drawPediatricGrowthChart({ doc, y, patient, visit, points, arrival });
      } catch (e) {
        console.error("Errore grafico crescita PDF:", e);
      }
    }

    try { this.drawFooter(doc, doctor, fo); return doc.output("blob") as Blob; }
    finally { this.fCtx = null; }
  }

  // ─── RICHIESTA ESAME ──────────────────────────────────────────────────────
  static async generateRichiestaEsamePDF(
    patient: Patient, richiesta: RichiestaEsameComplementare, doctor: Doctor | null
  ): Promise<Blob> {
    const doc = new jsPDF();
    let y = this.drawHeader(doc, "RICHIESTA ESAME COMPLEMENTARE", "Prescrizione esame", doctor, false);
    y = this.drawPatientBlock(doc, patient, richiesta.dataRichiesta, y);
    y += 4;
    y = this.heading(doc, y, "Esame richiesto");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); this.tc(doc, K0);
    y = this.block(doc, richiesta.nome, ML + 1, y, PW - 2, undefined, {
      font: "helvetica", style: "bold", fontSize: 10, color: K0,
    });
    if (richiesta.note?.trim()) {
      y += 2; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); this.tc(doc, K30);
      y = this.block(doc, richiesta.note, ML + 1, y, PW - 2, undefined, {
        font: "helvetica", style: "normal", fontSize: 9.5, color: K30,
      });
    }
    y += 4; doc.setFont("helvetica", "normal"); doc.setFontSize(8); this.tc(doc, K140);
    doc.text("Data richiesta: " + fd(richiesta.dataRichiesta), ML + 1, y);
    const prefs = await PreferenceService.getPreferences();
    this.drawFooter(doc, doctor, {
      showDoctorPhoneInPdf: prefs?.showDoctorPhoneInPdf as boolean | undefined,
      showDoctorEmailInPdf: prefs?.showDoctorEmailInPdf as boolean | undefined,
    });
    return doc.output("blob") as Blob;
  }

  // ─── CERTIFICATO ──────────────────────────────────────────────────────────
  static async generateCertificatoPDF(
    patient: Patient, certificato: CertificatoPaziente, doctor: Doctor | null
  ): Promise<Blob> {
    const doc = new jsPDF();
    const tipoL: Record<CertificatoPaziente["tipo"], string> = {
      assenza_lavoro: "Assenza da lavoro", idoneita: "Idoneita'", malattia: "Malattia", altro: "Altro",
    };
    const headerTitle = certificato.titolo?.trim() || "CERTIFICATO MEDICO";
    let y = this.drawHeader(doc, headerTitle, tipoL[certificato.tipo] || certificato.tipo, doctor, false);
    y = this.drawPatientBlock(doc, patient, certificato.dataCertificato, y, "Data certificato");
    y += 4;
    y = this.heading(doc, y, "Testo del Certificato");
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); this.tc(doc, K30);
    y = this.block(doc, certificato.descrizione || "", ML + 1, y, PW - 2, undefined, {
      font: "helvetica", style: "normal", fontSize: 10, color: K30,
    });
    const prefs = await PreferenceService.getPreferences();
    this.drawFooter(doc, doctor, {
      showDoctorPhoneInPdf: prefs?.showDoctorPhoneInPdf as boolean | undefined,
      showDoctorEmailInPdf: prefs?.showDoctorEmailInPdf as boolean | undefined,
    });
    return doc.output("blob") as Blob;
  }
}
