import type { Brand, Campaign } from '../schemas';
import { aspectRatio } from '../engine/generate';
import { formatTime } from '../engine/util';
import { generatorLabel, selectedConcept } from './txt';
import regularFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import boldFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';

// DejaVu Sans covers Latin (incl. Azerbaijani/Turkish letters) and Cyrillic,
// which jsPDF's built-in Helvetica cannot render.
async function fontBase64(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(binary);
}

const COLORS = {
  ink: [24, 28, 45] as const,
  muted: [96, 106, 128] as const,
  primary: [128, 101, 246] as const,
  secondary: [54, 184, 232] as const,
  line: [222, 226, 236] as const,
  soft: [245, 243, 255] as const,
};

export async function campaignToPdf(c: Campaign, brand?: Brand | null): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const [regular, bold] = await Promise.all([fontBase64(regularFontUrl), fontBase64(boldFontUrl)]);
  doc.addFileToVFS('DejaVuSans.ttf', regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const setColor = (rgb: readonly [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const ensure = (h: number) => {
    if (y + h > pageH - margin - 20) {
      doc.addPage();
      y = margin;
    }
  };
  const para = (text: string, opts: { size?: number; bold?: boolean; color?: readonly [number, number, number]; indent?: number; gap?: number } = {}) => {
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
  const label = (name: string, value: string, indent = 0) => {
    para(name.toUpperCase(), { size: 7.5, bold: true, color: COLORS.muted, indent, gap: 1 });
    para(value, { size: 10, indent, gap: 6 });
  };
  const heading = (text: string) => {
    ensure(40);
    y += 8;
    doc.setFillColor(...COLORS.primary);
    doc.rect(margin, y + 2, 4, 16, 'F');
    para(text, { size: 14, bold: true, indent: 12, gap: 8 });
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
  doc.text(doc.splitTextToSize(c.name, contentW)[0] as string, margin, 76);
  doc.setFont('DejaVu', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(200, 206, 222);
  doc.text(`${brand?.name ?? c.input.productName} · ${c.input.platform} · ${c.input.duration}s · ${c.input.language}`, margin, 98);
  y = 148;

  heading('Campaign overview');
  label('Brand', brand?.name ?? c.input.productName);
  label('Product', `${c.input.productName} (${c.input.category})${c.input.price ? ` · ${c.input.price}` : ''}`);
  label('Format', `${c.input.platform}, ${aspectRatio(c.input.platform)}, ${c.input.duration} seconds`);
  label('Style and tone', `${c.input.style} · ${c.input.tone} · Goal: ${c.input.goal}`);
  label('Target audience', c.input.audience);
  label('Generated with', generatorLabel(c));

  const concept = selectedConcept(c);
  if (concept) {
    heading('Campaign concept');
    label('Title', concept.title);
    label('Main idea', concept.mainIdea);
    label('Advertising angle', concept.angle);
    label('Emotional trigger', concept.emotionalTrigger);
    label('Opening hook', concept.hook);
    label('Main message', concept.message);
    label('Call to action', concept.cta);
    label('Visual direction', concept.visualDirection);
  }

  if (c.scenes.length) {
    heading(`Advertising script and storyboard (${c.scenes.reduce((a, s) => a + s.duration, 0)}s)`);
    let t = 0;
    c.scenes.forEach((s, i) => {
      const start = t;
      t += s.duration;
      ensure(70);
      doc.setFillColor(...COLORS.soft);
      doc.roundedRect(margin, y, contentW, 22, 4, 4, 'F');
      doc.setFont('DejaVu', 'bold');
      doc.setFontSize(10);
      setColor(COLORS.primary);
      doc.text(`Scene ${i + 1}`, margin + 10, y + 15);
      setColor(COLORS.muted);
      doc.setFont('DejaVu', 'normal');
      doc.text(`${formatTime(start)}–${formatTime(t)} · ${s.duration}s · ${s.shot} shot`, margin + 70, y + 15);
      y += 30;
      label('Visual', s.visual, 10);
      label('Camera', s.camera, 10);
      label('Action', s.action, 10);
      label('On-screen text', s.onScreenText, 10);
      label('Voiceover', s.voiceover, 10);
      label('Sound effects', s.sfx, 10);
      label('Transition', s.transition, 10);
      y += 4;
    });
  }

  if (c.voiceover) {
    heading('Voiceover');
    para(`Language: ${c.voiceover.language} · Tone: ${c.voiceover.tone}`, { size: 9, color: COLORS.muted, gap: 8 });
    para(c.voiceover.text, { size: 10.5, gap: 8 });
  }

  if (c.social) {
    heading('Social media captions');
    label('Short title', c.social.shortTitle);
    label('Instagram caption', c.social.instagram);
    label('TikTok caption', c.social.tiktok);
    label('YouTube Shorts description', c.social.youtubeShorts);
    label('Facebook promotional text', c.social.facebook);
    heading('Hashtags');
    para(c.social.hashtags.join('  '), { size: 10, color: COLORS.primary });
    label('CTA suggestions', c.social.ctas.map((x) => `• ${x}`).join('\n'));
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COLORS.line);
    doc.line(margin, pageH - 36, pageW - margin, pageH - 36);
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(8);
    setColor(COLORS.muted);
    doc.text(`AdSpark · ${c.name}`, margin, pageH - 22);
    doc.text(`${p} / ${pages}`, pageW - margin, pageH - 22, { align: 'right' });
  }

  return doc.output('blob');
}
