import type { Brand, Campaign } from '../schemas';
import { buildReport, type Report } from './report';
import regularFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import boldFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';

export interface PdfFonts {
  regular: string; // base64 TTF
  bold: string;
}

export class PdfExportError extends Error {}

function toBase64(buf: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(binary);
}

// DejaVu Sans covers Latin (incl. Azerbaijani/Turkish letters) and Cyrillic,
// which jsPDF's built-in Helvetica cannot render. Loaded only when a PDF is requested.
async function loadBrowserFonts(): Promise<PdfFonts> {
  const load = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new PdfExportError('The PDF font could not be loaded.');
    return toBase64(new Uint8Array(await res.arrayBuffer()));
  };
  const [regular, bold] = await Promise.all([load(regularFontUrl), load(boldFontUrl)]);
  return { regular, bold };
}

type RGB = readonly [number, number, number];
const COLORS = {
  ink: [24, 28, 45] as RGB,
  muted: [96, 106, 128] as RGB,
  primary: [128, 101, 246] as RGB,
  secondary: [54, 184, 232] as RGB,
  line: [222, 226, 236] as RGB,
  soft: [245, 243, 255] as RGB,
};

export async function renderReportPdf(report: Report, fonts: PdfFonts): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setProperties({ title: `${report.title} — AdSpark campaign report`, creator: 'AdSpark' });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const setColor = (rgb: RGB) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const ensure = (h: number) => {
    if (y + h > pageH - margin - 20) {
      doc.addPage();
      y = margin;
    }
  };
  const para = (text: string, opts: { size?: number; bold?: boolean; color?: RGB; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    doc.setFont('DejaVu', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    setColor(opts.color ?? COLORS.ink);
    const lines = doc.splitTextToSize(text || '—', contentW - indent) as string[];
    const lh = size * 1.4;
    for (const line of lines) {
      ensure(lh);
      doc.text(line, margin + indent, y + size);
      y += lh;
    }
    y += opts.gap ?? 4;
  };
  const field = (label: string, value: string, indent = 0) => {
    ensure(34);
    para(label.toUpperCase(), { size: 7.5, bold: true, color: COLORS.muted, indent, gap: 1 });
    para(value, { size: 10, indent, gap: 6 });
  };

  // Cover band
  doc.setFillColor(11, 16, 32);
  doc.rect(0, 0, pageW, 120, 'F');
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 116, pageW / 2, 4, 'F');
  doc.setFillColor(...COLORS.secondary);
  doc.rect(pageW / 2, 116, pageW / 2, 4, 'F');
  doc.setFont('DejaVu', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(170, 160, 255);
  doc.text('ADSPARK CAMPAIGN REPORT', margin, 44);
  doc.setFontSize(22);
  doc.setTextColor(245, 247, 255);
  doc.text(doc.splitTextToSize(report.title, contentW)[0] as string, margin, 76);
  doc.setFont('DejaVu', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(200, 206, 222);
  doc.text(doc.splitTextToSize(report.subtitle, contentW)[0] as string, margin, 98);
  y = 148;

  for (const b of report.blocks) {
    if (b.kind === 'heading') {
      ensure(48);
      y += 8;
      doc.setFillColor(...COLORS.primary);
      doc.rect(margin, y + 2, 4, 16, 'F');
      para(b.text, { size: 14, bold: true, indent: 12, gap: 8 });
    } else if (b.kind === 'field') {
      field(b.label, b.value);
    } else if (b.kind === 'paragraph') {
      para(b.text, b.muted ? { size: 9, color: COLORS.muted, gap: 8 } : { size: 10.5, gap: 8 });
    } else if (b.kind === 'tags') {
      para(b.text, { size: 10, color: COLORS.primary });
    } else {
      ensure(80);
      doc.setFillColor(...COLORS.soft);
      doc.roundedRect(margin, y, contentW, 22, 4, 4, 'F');
      doc.setFont('DejaVu', 'bold');
      doc.setFontSize(10);
      setColor(COLORS.primary);
      doc.text(`Scene ${b.number}`, margin + 10, y + 15);
      setColor(COLORS.muted);
      doc.setFont('DejaVu', 'normal');
      doc.text(b.meta, margin + 70, y + 15);
      y += 30;
      for (const [label, value] of b.fields) field(label, value, 10);
      y += 4;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COLORS.line);
    doc.line(margin, pageH - 36, pageW - margin, pageH - 36);
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(8);
    setColor(COLORS.muted);
    doc.text(`AdSpark · ${report.title}`.slice(0, 90), margin, pageH - 22);
    doc.text(`${p} / ${pages}`, pageW - margin, pageH - 22, { align: 'right' });
  }

  return doc.output('blob');
}

export async function campaignToPdf(c: Campaign, brand?: Brand | null, fonts?: PdfFonts): Promise<Blob> {
  return renderReportPdf(buildReport(c, brand), fonts ?? (await loadBrowserFonts()));
}
