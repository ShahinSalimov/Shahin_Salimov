import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReport } from './report';
import { campaignToPdf, renderReportPdf, PdfExportError } from './pdf';
import { campaignToText } from './txt';
import { safeFileName } from './download';
import { createProjectFile, parseImport } from '../backup';
import { brandSchema, campaignInputSchema, campaignSchema, type Campaign } from '../schemas';
import { generateConcepts, generateScenes, generateSocial, generateVoiceover } from '../engine/generate';

const fonts = {
  regular: readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf').toString('base64'),
  bold: readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf').toString('base64'),
};

const input = campaignInputSchema.parse({
  productName: 'Çay Evi',
  description: 'Traditional Azerbaijani tea house with homemade jams.',
  category: 'Restaurant',
  price: '8 AZN',
  benefits: 'Armudu glasses, homemade jam, cozy terrace',
  audience: 'friends who meet after work',
  problem: 'Noisy cafes with no place to talk',
  goal: 'Increase store visits',
  language: 'Azerbaijani',
  platform: 'Facebook',
  duration: 45,
  tone: 'Warm',
  style: 'Storytelling',
  cta: 'Bu axşam gəlin',
});
const concepts = generateConcepts(input, 21);
const scenes = generateScenes(input, concepts[0], 21);
const full: Campaign = campaignSchema.parse({
  id: 'cmp_x',
  name: 'Çay Evi — autumn',
  createdAt: 1,
  updatedAt: 1,
  input,
  concepts,
  selectedConceptId: concepts[0].id,
  scenes,
  voiceover: generateVoiceover(input, scenes),
  social: generateSocial(input, concepts[0], 21),
});
const brand = brandSchema.parse({ id: 'b', name: 'Çay Evi Brand', logo: null, colors: [], tone: 'Warm', audience: '', description: '', website: 'https://example.com', contact: '+994 00 000 00 00', createdAt: 1, updatedAt: 1 });

describe('report model (PDF content)', () => {
  const r = buildReport(full, brand);
  const text = JSON.stringify(r);
  it('contains every required section in order', () => {
    const headings = r.blocks.filter((b) => b.kind === 'heading').map((b) => (b as { text: string }).text);
    expect(headings[0]).toBe('Campaign overview');
    expect(headings[1]).toBe('Campaign concept');
    expect(headings[2]).toMatch(/^Advertising script and storyboard \(45s\)$/);
    expect(headings.slice(3)).toEqual(['Voiceover', 'Social media captions', 'Hashtags']);
  });
  it('includes brand name, concept, every scene, voiceover, captions and hashtags', () => {
    expect(r.brand).toBe('Çay Evi Brand');
    expect(text).toContain(concepts[0].hook);
    expect(r.blocks.filter((b) => b.kind === 'scene')).toHaveLength(7);
    expect(text).toContain(full.voiceover!.text.slice(0, 30).replace(/"/g, '\\\\"'));
    expect(text).toContain('Instagram caption');
    expect(text).toContain(full.social!.hashtags[0]);
    expect(text).toContain('Demo Generation');
    expect(text).toContain('https://example.com');
  });
  it('handles a campaign without script, voiceover or social content', () => {
    const draft = buildReport({ ...full, scenes: [], voiceover: null, social: null, selectedConceptId: null });
    expect(draft.blocks.some((b) => b.kind === 'scene')).toBe(false);
    expect(draft.blocks.filter((b) => b.kind === 'heading')).toHaveLength(1);
  });
});

describe('PDF rendering', () => {
  it('produces a valid multi-page PDF with embedded Unicode font', async () => {
    const blob = await renderReportPdf(buildReport(full, brand), fonts);
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const raw = bytes.toString('latin1');
    expect(raw).toContain('/FontFile2');
    expect((raw.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('reports a clear error when the font cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(campaignToPdf(full, brand)).rejects.toBeInstanceOf(PdfExportError);
  });
});

describe('TXT and JSON export', () => {
  it('TXT keeps Unicode text and scene timing', () => {
    const txt = campaignToText(full, brand);
    expect(txt).toContain('Brand: Çay Evi Brand');
    expect(txt).toContain('Scene 7 [');
    expect(txt).toContain('Total: 45s');
    expect(txt).toContain('-- Facebook promotional text --');
  });
  it('JSON project file round-trips without loss', () => {
    const back = parseImport(JSON.stringify(createProjectFile(full))).campaigns[0];
    expect(back).toEqual(full);
  });
  it('builds safe file names', () => {
    expect(safeFileName('Çay Evi — autumn / 2026', 'pdf')).toBe('cay-evi-autumn-2026.pdf');
    expect(safeFileName('<<>>', 'txt')).toBe('adspark-campaign.txt');
  });
});
