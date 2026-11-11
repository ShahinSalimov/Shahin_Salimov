import { backupSchema, brandSchema, campaignSchema, projectFileSchema, type Brand, type Campaign } from './schemas';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function createBackup(campaigns: Campaign[], brands: Brand[]) {
  return { app: 'AdSpark' as const, kind: 'backup' as const, version: 1 as const, exportedAt: Date.now(), campaigns, brands };
}

export function createProjectFile(campaign: Campaign) {
  return { app: 'AdSpark' as const, kind: 'campaign' as const, version: 1 as const, exportedAt: Date.now(), campaign };
}

export interface ImportResult {
  campaigns: Campaign[];
  brands: Brand[];
  skipped: number;
}

export class ImportError extends Error {}

/**
 * Parses either a full backup or a single-campaign project file.
 * Invalid individual records are skipped and counted instead of failing the whole import.
 */
export function parseImport(text: string): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError('The file is larger than 10 MB.');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JSON.');
  }
  const project = projectFileSchema.safeParse(json);
  if (project.success) {
    const c = campaignSchema.safeParse(project.data.campaign);
    if (!c.success) throw new ImportError('The campaign in this file is invalid or damaged.');
    return { campaigns: [c.data], brands: [], skipped: 0 };
  }
  const backup = backupSchema.safeParse(json);
  if (!backup.success) throw new ImportError('This is not an AdSpark backup or project file.');
  let skipped = 0;
  const campaigns: Campaign[] = [];
  const brands: Brand[] = [];
  for (const raw of backup.data.campaigns) {
    const r = campaignSchema.safeParse(raw);
    if (r.success) campaigns.push(r.data);
    else skipped++;
  }
  for (const raw of backup.data.brands) {
    const r = brandSchema.safeParse(raw);
    if (r.success) brands.push(r.data);
    else skipped++;
  }
  return { campaigns, brands, skipped };
}
