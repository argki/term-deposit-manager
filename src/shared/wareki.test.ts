import { describe, expect, it } from 'vitest';
import { formatDateWithWareki, formatYearWithWareki, toWarekiShort } from './wareki.js';

describe('wareki helpers', () => {
  it('converts western years to short wareki labels', () => {
    expect(toWarekiShort(2026)).toBe('R8');
    expect(toWarekiShort(2027)).toBe('R9');
    expect(toWarekiShort(2019)).toBe('R1');
    expect(toWarekiShort(2018)).toBe('H30');
    expect(toWarekiShort(1989)).toBe('H1');
  });

  it('formats year and ISO date with wareki', () => {
    expect(formatYearWithWareki('2031')).toBe('2031 (R13)');
    expect(formatDateWithWareki('2027-01-04')).toBe('2027/01/04 (R9)');
  });
});
