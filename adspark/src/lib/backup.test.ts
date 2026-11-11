import { describe, expect, it } from 'vitest';
import { createBackup, createProjectFile, ImportError, parseImport } from './backup';
import { campaignSchema, campaignInputSchema } from './schemas';
import { campaignToText } from './export/txt';
import { generateConcepts, generateScenes, generateSocial, generateVoiceover } from './engine/generate';
import { sniffImageType } from './files';
import { duplicateAt, move, removeAt, totalDuration } from './scenes';

const input = campaignInputSchema.parse({
  productName: 'FitPro Studio',
  description: 'Small-group strength training with certified coaches.',
  category: 'Fitness',
  benefits: 'Personal attention, flexible hours, first class free',
  audience: 'office workers who sit all day',
  problem: 'Back pain from sitting at a desk',
  goal: 'Generate leads',
  language: 'Azerbaijani',
  platform: 'TikTok',
  duration: 15,
  tone: 'Energetic',
  style: 'UGC',
  cta: 'Pulsuz dərsə yazılın',
});
const concepts = generateConcepts(input, 9);
const scenes = generateScenes(input, concepts[0], 9);
const campaign = campaignSchema.parse({
  id: 'cmp_1',
  name: 'FitPro launch',
  createdAt: 1,
  updatedAt: 2,
  input,
  concepts,
  selectedConceptId: concepts[0].id,
  scenes,
  voiceover: generateVoiceover(input, scenes),
  social: generateSocial(input, concepts[0], 9),
});

describe('backup and project files', () => {
  it('round-trips a full backup', () => {
    const r = parseImport(JSON.stringify(createBackup([campaign], [])));
    expect(r.campaigns).toHaveLength(1);
    expect(r.campaigns[0].scenes).toHaveLength(scenes.length);
    expect(r.skipped).toBe(0);
  });
  it('imports a single project file', () => {
    expect(parseImport(JSON.stringify(createProjectFile(campaign))).campaigns[0].name).toBe('FitPro launch');
  });
  it('skips damaged records instead of failing', () => {
    const bad = { ...createBackup([campaign], []), campaigns: [campaign, { id: 1, nope: true }] };
    const r = parseImport(JSON.stringify(bad));
    expect(r.campaigns).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
  it('rejects invalid JSON and foreign files', () => {
    expect(() => parseImport('{oops')).toThrow(ImportError);
    expect(() => parseImport(JSON.stringify({ hello: 'world' }))).toThrow(ImportError);
  });
});

describe('TXT export', () => {
  it('contains every campaign section and labels the engine honestly', () => {
    const txt = campaignToText(campaign);
    for (const part of ['CONCEPT', 'VIDEO SCRIPT', 'VOICEOVER', 'SOCIAL MEDIA CONTENT', 'Scene 1', 'Total: 15s', 'Demo Generation: AdSpark local template engine (not AI)']) {
      expect(txt).toContain(part);
    }
  });
});

describe('scene operations', () => {
  it('duplicates, moves and removes scenes', () => {
    const dup = duplicateAt(scenes, 0);
    expect(dup).toHaveLength(scenes.length + 1);
    expect(dup[1].id).not.toBe(dup[0].id);
    expect(move(scenes, 0, 1)[1].id).toBe(scenes[0].id);
    expect(removeAt(scenes, 0)).toHaveLength(scenes.length - 1);
    expect(totalDuration(scenes)).toBe(15);
  });
});

describe('image sniffing', () => {
  it('detects real image types and rejects others', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
  });
});

describe('demo campaign', async () => {
  const { buildDemoCampaign } = await import('./demoCampaign');
  it('is a complete, valid, clearly labelled sample', () => {
    const d = buildDemoCampaign(1);
    expect(d.name.startsWith('Sample:')).toBe(true);
    expect(d.concepts).toHaveLength(5);
    expect(d.scenes.reduce((a, s) => a + s.duration, 0)).toBe(30);
    expect(d.voiceover && d.social && d.selectedConceptId).toBeTruthy();
    expect(d.generator.engine).toBe('local');
  });
});
