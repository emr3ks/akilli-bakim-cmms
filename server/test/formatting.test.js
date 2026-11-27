import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPlantDate,
} from '../../src/format.ts';

describe('Hermes-safe CMMS formatting', () => {
  it('formats plant-local dates without Intl formatToParts', () => {
    expect(formatDate('2026-11-20')).toBe('20.11.2026');
    expect(formatDateTime('2026-11-20T08:15:00.000Z')).toBe('20.11.2026 11:15');
    expect(formatPlantDate(new Date('2026-11-26T21:30:00.000Z'))).toBe('2026-11-27');
  });

  it('formats Turkish numbers and durations deterministically', () => {
    expect(formatNumber(5023.6, 2)).toBe('5.023,60');
    expect(formatNumber(1250, 0)).toBe('1.250');
    expect(formatDuration(75)).toBe('1 sa 15 dk');
    expect(formatDuration(null)).toBe('—');
  });

  it('returns safe fallbacks for invalid values', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatNumber(Number.NaN)).toBe('—');
  });
});
