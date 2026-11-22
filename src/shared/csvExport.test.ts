import { describe, expect, it } from 'vitest';
import { exportDepositsToCsv } from './csvExport.js';
import { DEFAULT_SETTINGS } from './deposits.js';
import type { DepositRecord } from './types.js';

describe('exportDepositsToCsv', () => {
  it('exports UTF-8 BOM CSV with escaped fields and status labels', () => {
    const records: DepositRecord[] = [
      {
        id: 'id-1',
        bankName: 'A銀行',
        startDate: '2026-01-04',
        maturityDate: '2026-12-31',
        termYears: 1,
        baseRate: 1.0,
        campaignRate: 0.25,
        totalRate: 1.25,
        campaignNote: 'キャンペーン, "特別"',
        amount: 500_000,
        maturityInterest: null,
        status: 'active',
        parentDepositId: null,
        rolledOverToId: null,
        createdAt: '2026-01-04T00:00:00Z',
        updatedAt: '2026-01-04T00:00:00Z',
      },
    ];

    const csv = exportDepositsToCsv(records, DEFAULT_SETTINGS, '2026-11-22');
    expect(csv.startsWith('\uFEFF銀行名,ステータス,')).toBe(true);
    expect(csv).toContain('A銀行,まもなく満期,2026-01-04,2026-12-31,39,1,1,0.25,1.25,500000,,,"キャンペーン, ""特別"""');
  });
});
