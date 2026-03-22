import jsPDF from "jspdf";
import {
  Patient, Visit, Doctor,
  RichiestaEsameComplementare,
  CertificatoPaziente,
} from "../types/Storage";
import { DoctorService, PreferenceService, VisitService } from "./OfflineServices";
import { backgroundCmTicksEvery20 } from "../utils/growthChartTicks";
import { parseDateOnlyLocalMs } from "../utils/dateUtils";

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
  // AUXOLOGIA: griglia orizzontale (stile legacy drawGridRow — etichette + valori centrati)
  // ─────────────────────────────────────────────────────────────────────────────
  /** Una riga di celle affiancate con divisori verticali (come nelle versioni precedenti del PDF). */
  private static drawAuxologicalGridRow(
    doc: jsPDF,
    y: number,
    items: { label: string; value: string }[],
  ): number {
    if (items.length === 0) return y;
    const rowHeight = 10;
    const colWidth = PW / items.length;

    y = this.pb(doc, y, rowHeight + 10);

    this.dc(doc, K200); doc.setLineWidth(0.1);
    doc.line(ML, y, MR, y);

    items.forEach((item, i) => {
      const x = ML + colWidth * i;

      doc.setFont("helvetica", "bold"); doc.setFontSize(7); this.tc(doc, K80);
      doc.text(san(item.label), x + colWidth / 2, y + 3.5, { align: "center" });

      doc.setFont("helvetica", "normal"); doc.setFontSize(9); this.tc(doc, K30);
      const raw = item.value?.trim() ? san(item.value) : "";
      const lines = raw ? doc.splitTextToSize(raw, colWidth - 2) : [""];
      doc.text(lines[0] ?? "", x + colWidth / 2, y + 7.5, { align: "center" });

      if (i < items.length - 1) {
        this.dc(doc, K200); doc.setLineWidth(0.1);
        doc.line(x + colWidth, y, x + colWidth, y + rowHeight);
      }
    });

    this.dc(doc, K200); doc.setLineWidth(0.1);
    doc.line(ML, y + rowHeight, MR, y + rowHeight);

    return y + rowHeight + 6;
  }

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
    const formatPerc = (p?: string | number | null): string => {
      if (p == null) return "";
      const raw = String(p).trim();
      if (!raw) return "";
      const normalized = raw.endsWith("°") ? raw.slice(0, -1).trim() : raw;
      return `${normalized}°`;
    };

    const build = (
      measure: number | null | undefined,
      unit: string,
      perc?: string | number | null,
      formatMeasure?: (m: number) => string,
    ): string => {
      const pStr = formatPerc(perc);
      const hasM = measure != null && Number.isFinite(measure as number);
      if (!hasM && !pStr) return "";
      let base = "";
      if (hasM) {
        const m = measure as number;
        base = formatMeasure ? formatMeasure(m) : `${m}${unit}`;
      }
      if (pStr) return base ? `${base} (${pStr})` : `(${pStr})`;
      return base;
    };

    const pa = params.pressioneArteriosa?.trim() || "";
    const st = params.stadioTurner?.trim() || "";

    const numericCandidates: { label: string; value: string }[] = includeCcAndBmi
      ? [
          { label: "PESO", value: build(params.peso ?? null, " kg", params.percentilePeso) },
          { label: "ALTEZZA", value: build(params.altezza ?? null, " cm", params.percentileAltezza) },
          { label: "C.C.", value: build(params.circonferenzaCranica ?? null, " cm", params.percentileCC) },
          { label: "BMI", value: build(params.bmi ?? null, "", params.percentileBmi, m => String(m)) },
        ]
      : [
          { label: "PESO", value: build(params.peso ?? null, " kg", params.percentilePeso) },
          { label: "ALTEZZA", value: build(params.altezza ?? null, " cm", params.percentileAltezza) },
          { label: "BMI", value: build(params.bmi ?? null, "", params.percentileBmi, m => String(m)) },
        ];

    // Una sola riga: misure + PA + Turner (solo colonne con dato)
    const row: { label: string; value: string }[] = [
      ...numericCandidates.filter(c => c.value.trim() !== ""),
      ...(pa ? [{ label: "PA", value: pa } as const] : []),
      ...(st ? [{ label: "STADIO DI TURNER", value: st } as const] : []),
    ];

    if (row.length === 0) return y;

    y = this.heading(doc, y, "Parametri Auxologici");
    y = this.drawAuxologicalGridRow(doc, y, row);

    return y + 2;
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
  // PEDIATRIC GROWTH CHART
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

    params.y = this.pb(doc, params.y, 90);

    // Title
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); this.tc(doc, K0);
    doc.text("Andamento Crescita (Altezza)", ML, params.y);
    this.rule(doc, params.y + 1.5, ML, MR, 0.25);
    params.y += 10;

    const boxY = params.y;
    const leftAxisW = 12;
    const boxX = ML + leftAxisW;
    const boxW = PW - leftAxisW - 5;
    const boxH = 60;

    const all = arrival
      ? [...points.map(p => ({ ...p })), { xIso: arrival.xIso, yCm: arrival.yCm }]
      : points;

    const xs = all.map(p => parseDateOnlyLocalMs(p.xIso)).filter(t => Number.isFinite(t));
    const ys = all.map(p => p.yCm).filter(v => Number.isFinite(v));

    if (xs.length < 1 || ys.length < 1) return boxY + boxH + 10;

    const minXRaw = Math.min(...xs);
    const maxXRaw = Math.max(...xs);
    
    // X-axis padding (approx 1 month in ms)
    const paddingX = 30 * 24 * 60 * 60 * 1000;
    const minX = minXRaw === maxXRaw ? minXRaw - paddingX : minXRaw - paddingX;
    const maxX = minXRaw === maxXRaw ? minXRaw + paddingX : maxXRaw + paddingX;

    const minYRaw = Math.min(...ys);
    const maxYRaw = Math.max(...ys);
    
    // Y-axis bounds (dynamic step: 5 or 10 cm based on range)
    const spanYRaw = Math.max(10, maxYRaw - minYRaw);
    const stepY = spanYRaw > 40 ? 10 : 5;
    let minY = Math.floor((minYRaw - spanYRaw * 0.1) / stepY) * stepY;
    let maxY = Math.ceil((maxYRaw + spanYRaw * 0.1) / stepY) * stepY;
    if (minY === maxY) {
        minY -= stepY;
        maxY += stepY;
    }
    
    const spanY2 = maxY - minY;
    const spanX = Math.max(1, maxX - minX);

    const xScale = (t: number) => boxX + ((t - minX) / spanX) * boxW;
    const yScale = (v: number) => boxY + boxH - ((v - minY) / spanY2) * boxH;

    // Background Grid
    this.dc(doc, K235); doc.setLineWidth(0.15);
    
    // Horizontal lines every stepY
    for (let yVal = minY; yVal <= maxY; yVal += stepY) {
      const yPos = yScale(yVal);
      doc.line(boxX, yPos, boxX + boxW, yPos);
      
      // Y-axis labels
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); this.tc(doc, K80);
      doc.text(`${yVal}`, boxX - 2, yPos + 2.5, { align: "right" });
    }
    // Unit label
    doc.setFont("helvetica", "italic"); doc.setFontSize(6.5); this.tc(doc, K140);
    doc.text("cm", boxX - 2, boxY - 2, { align: "right" });

    // Vertical lines (time segments)
    const xSegments = 4;
    for (let i = 0; i <= xSegments; i++) {
      const t = minX + (spanX * i) / xSegments;
      const xPos = xScale(t);
      doc.line(xPos, boxY, xPos, boxY + boxH);
    }

    // Axis frames
    this.dc(doc, K100); doc.setLineWidth(0.3);
    doc.line(boxX, boxY, boxX, boxY + boxH); // Left Y
    doc.line(boxX, boxY + boxH, boxX + boxW, boxY + boxH); // Bottom X

    const sortedPoints = [...points].sort(
      (a, b) => parseDateOnlyLocalMs(a.xIso) - parseDateOnlyLocalMs(b.xIso),
    );

    // Connecting lines with VC (Growth Velocity)
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const a = sortedPoints[i];
      const b = sortedPoints[i + 1];
      const tsA = parseDateOnlyLocalMs(a.xIso);
      const tsB = parseDateOnlyLocalMs(b.xIso);
      const cx1 = xScale(tsA);
      const cy1 = yScale(a.yCm);
      const cx2 = xScale(tsB);
      const cy2 = yScale(b.yCm);

      // Line
      this.dc(doc, K30); doc.setLineWidth(0.4);
      doc.line(cx1, cy1, cx2, cy2);

      // Growth Velocity Label
      const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
      const yearsDiff = (tsB - tsA) / msPerYear;
      if (yearsDiff > 0.08) {
        const vc = (b.yCm - a.yCm) / yearsDiff;
        const vcLabel = `${vc.toFixed(1)} cm/anno`;
        const midX = (cx1 + cx2) / 2;
        const midY = (cy1 + cy2) / 2;

        doc.setFont("helvetica", "italic"); doc.setFontSize(6.5); this.tc(doc, K80);
        doc.text(vcLabel, midX, midY - 3, { align: "center", baseline: "middle" });
      }
    }

    // Collision detection for labels
    const placedLabels: { x: number, y: number, w: number, h: number }[] = [];
    const checkCollision = (nx: number, ny: number, nw: number, nh: number) => {
      const padX = 1.5;
      const padY = 1.5;
      for (const l of placedLabels) {
        if (nx < l.x + l.w + padX && nx + nw + padX > l.x &&
            ny < l.y + l.h + padY && ny + nh + padY > l.y) return true;
      }
      return false;
    };

    const tickXs = [...new Set(sortedPoints.map(p => parseDateOnlyLocalMs(p.xIso)))];
    const manyDates = tickXs.length > 5;

    // Points and Values
    for (let i = 0; i < sortedPoints.length; i++) {
      const p = sortedPoints[i];
      const t = parseDateOnlyLocalMs(p.xIso);
      const cx = xScale(t);
      const cy = yScale(p.yCm);
      
      // Drop line to X axis
      doc.setLineDashPattern([1, 1], 0);
      this.dc(doc, K200); doc.setLineWidth(0.15);
      doc.line(cx, cy, cx, boxY + boxH);
      doc.setLineDashPattern([], 0);

      // Dot
      this.dc(doc, K0); this.fc(doc, K245); doc.setLineWidth(0.3);
      doc.circle(cx, cy, 1.2, "FD");
      
      // Height Label (just value, positioned dynamically to avoid overlap)
      const label = `${p.yCm}`;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); this.tc(doc, K0);
      const lw = doc.getTextWidth(label);
      const lh = 3;
      const offsets = [
        { dx: 0, dy: -3.5 },         // top
        { dx: 0, dy: 4.5 },          // bottom
        { dx: 3 + lw/2, dy: 0 },     // right
        { dx: -3 - lw/2, dy: 0 },    // left
        { dx: 2 + lw/2, dy: -2.5 },  // top-right
        { dx: -2 - lw/2, dy: -2.5 }, // top-left
        { dx: 2 + lw/2, dy: 3.5 },   // bottom-right
        { dx: -2 - lw/2, dy: 3.5 }   // bottom-left
      ];
      
      let finalX = cx;
      let finalY = cy - 3.5; // default fallback
      for (const off of offsets) {
          const nx = cx + off.dx - lw/2;
          const ny = cy + off.dy - lh/2;
          if (!checkCollision(nx, ny, lw, lh)) {
              placedLabels.push({ x: nx, y: ny, w: lw, h: lh });
              finalX = cx + off.dx;
              finalY = cy + off.dy;
              break;
          }
      }
      doc.text(label, finalX, finalY, { align: "center", baseline: "middle" });
      
      // Date Label on X axis
      const d = new Date(t);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = String(d.getFullYear()).slice(-2);
      const dateStr = `${dd}/${mm}/${yy}`;
      
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); this.tc(doc, K80);
      if (manyDates) {
        doc.text(dateStr, cx, boxY + boxH + 3.5, { align: "right", angle: -35 });
      } else {
        doc.text(dateStr, cx, boxY + boxH + 4, { align: "center" });
      }
    }

    // Target Height (Arrival Marker)
    if (arrival && Number.isFinite(arrival.yCm)) {
      const ts = parseDateOnlyLocalMs(arrival.xIso);
      if (Number.isFinite(ts)) {
        const cx = xScale(ts);
        const cy = yScale(arrival.yCm);
        
        if (sortedPoints.length > 0) {
          const lp = sortedPoints[sortedPoints.length - 1];
          doc.setLineDashPattern([1.5, 1.5], 0);
          this.dc(doc, K80); doc.setLineWidth(0.3);
          doc.line(xScale(parseDateOnlyLocalMs(lp.xIso)), yScale(lp.yCm), cx, cy);
          doc.setLineDashPattern([], 0);
        }
        
        const r = 2;
        this.dc(doc, K0); this.fc(doc, K235); doc.setLineWidth(0.3);
        doc.moveTo(cx, cy - r);
        doc.lineTo(cx + r, cy);
        doc.lineTo(cx, cy + r);
        doc.lineTo(cx - r, cy);
        doc.lineTo(cx, cy - r);
        (doc as any).fillStroke();
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); this.tc(doc, K0);
        doc.text(`Target gen. ${arrival.yCm} cm`, cx, cy - 3.5, { align: "center" });
      }
    }

    return boxY + boxH + (manyDates ? 16 : 12);
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
    else if (visit.tipo === "controllo") title = "CONTROLLO PEDIATRICO";

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

    if (visit.anamnesi) y = this.drawTextSection(doc, y, "Anamnesi", visit.anamnesi);
    if (visit.descrizioneClinica) y = this.drawTextSection(doc, y, "Patologica prossima", visit.descrizioneClinica);
    if (visit.esamiObiettivo) y = this.drawTextSection(doc, y, "Visita", visit.esamiObiettivo);

    const conclusioniMerge = [visit.conclusioniDiagnostiche, visit.terapie].filter(Boolean).join('\n\n');
    if (conclusioniMerge) y = this.drawTextSection(doc, y, "Conclusioni e Terapie", conclusioniMerge);

    if (ped?.notePediatriche) y = this.drawTextSection(doc, y, "Note cliniche / Educazione sanitaria", ped.notePediatriche);

    if (options?.includeGrowthChart !== false) {
      try {
        const allVisits = await VisitService.getVisitsByPatientId(patient.id);
        const limitDay = visit.dataVisita?.slice(0, 10) || "";
        const rawPoints = allVisits
          .filter(v => v?.pediatria?.altezza != null && Number.isFinite(v.pediatria.altezza as number))
          .filter(v => (v.dataVisita?.slice(0, 10) || "") <= limitDay)
          .map(v => ({ xIso: v.dataVisita, yCm: v.pediatria!.altezza as number }));

        if (ped?.altezza != null && Number.isFinite(ped.altezza as number)) {
          rawPoints.push({ xIso: visit.dataVisita, yCm: ped.altezza as number });
        }

        const map = new Map<string, { xIso: string; yCm: number }>();
        for (const p of rawPoints) map.set(`${p.xIso}|${Number(p.yCm).toFixed(2)}`, p);
        const points = Array.from(map.values()).sort(
          (a, b) => parseDateOnlyLocalMs(a.xIso) - parseDateOnlyLocalMs(b.xIso),
        );

        const father = ped?.altezzaPadre ?? patient.altezzaPadre;
        const mother = ped?.altezzaMadre ?? patient.altezzaMadre;
        let arrival: { xIso: string; yCm: number } | undefined = undefined;
        if (father != null && mother != null && Number.isFinite(father) && Number.isFinite(mother) && patient.sesso) {
          const sum = (father as number) + (mother as number);
          const est = patient.sesso === "M" ? (sum + 13) / 2 : (sum - 13) / 2;
          if (Number.isFinite(est)) {
            const day = visit.dataVisita?.trim().slice(0, 10);
            if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
              const [y, m, da] = day.split("-").map(Number);
              const adv = new Date(y, m - 1, da);
              adv.setDate(adv.getDate() + 1);
              const nextIso = `${adv.getFullYear()}-${String(adv.getMonth() + 1).padStart(2, "0")}-${String(adv.getDate()).padStart(2, "0")}`;
              arrival = { xIso: nextIso, yCm: est };
            }
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
    let y = this.drawHeader(doc, "RICHIESTA ESAME COMPLEMENTARE", "Prescrizione esame", doctor);
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
      assenza_lavoro: "Assenza da scuola / astensione",
      idoneita: "Idoneita' alla frequenza scolastica",
      malattia: "Certificato di malattia",
      altro: "Altro",
    };
    const headerTitle = certificato.titolo?.trim() || "CERTIFICATO MEDICO";
    // Stessa intestazione del referto: Dott., specializzazione, linee, titolo documento
    let y = this.drawHeader(doc, headerTitle, tipoL[certificato.tipo] || certificato.tipo, doctor);
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
