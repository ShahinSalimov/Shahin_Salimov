import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { useApp } from './app';
import { db } from '../lib/db';
import { DEMO_INPUT } from '../lib/demoCampaign';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('campaign persistence', () => {
  it('writes the first change immediately and coalesces bursts of edits', async () => {
    const c = useApp.getState().createCampaign(DEMO_INPUT);
    await wait(20);
    expect((await db.listCampaigns()).items.map((x) => x.id)).toContain(c.id);

    // A structural change (e.g. a generated script) is on disk almost at once.
    useApp.getState().updateCampaign(c.id, (x) => ({ ...x, name: 'Generated' }));
    await wait(20);
    expect((await db.listCampaigns()).items.find((x) => x.id === c.id)?.name).toBe('Generated');

    // Typing: many quick edits end with the last value persisted.
    for (const n of ['A', 'AB', 'ABC']) useApp.getState().updateCampaign(c.id, (x) => ({ ...x, name: n }));
    await wait(400);
    expect((await db.listCampaigns()).items.find((x) => x.id === c.id)?.name).toBe('ABC');
    expect(useApp.getState().saveState).toBe('saved');
  });
});
