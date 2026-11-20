import { describe, expect, it } from 'vitest';
import { relativeTime } from './campaignMeta';

describe('relativeTime', () => {
  const now = Date.UTC(2026, 0, 10, 12);
  it('formats recent times', () => {
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2 d ago');
  });
});
