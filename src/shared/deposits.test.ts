import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  addYearsToIsoDate,
  calculateEstimatedInterest,
  diffDays,
  enrichDeposit,
  enrichDeposits,
  getDepositTraceChain,
  summarizeByMaturityYear,
  summarizePortfolio,
} from './deposits.js';
import type { DepositRecord } from './types.js';

function makeDeposit(overrides: Partial<DepositRecord> = {}): DepositRecord {
  return {
    id: 'dep-1',
    bankName: 'A銀行',
    startDate: '2026-01-02',
    maturityDate: '2027-01-02',
    termYears: 1,
    baseRate: 1.0,
    campaignRate: 0,
    totalRate: 1.0,
    campaignNote: '',
    amount: 1_000_000,
    maturityInterest: null,
    status: 'active',
    parentDepositId: null,
    rolledOverToId: null,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('deposits domain logic', () => {
  it('computes diffDays and addYearsToIsoDate accurately', () => {
    expect(diffDays('2026-11-22', '2026-12-12')).toBe(20);
    expect(addYearsToIsoDate('2026-07-04', 3)).toBe('2029-07-04');
    expect(addYearsToIsoDate('2026-07-04', 0.5)).toBe('2027-01-04');
  });

  it('marks active deposits within maturingSoonDays as maturing_soon', () => {
    const ref = '2026-11-22';
    const soon = enrichDeposit(makeDeposit({ maturityDate: '2026-12-12' }), DEFAULT_SETTINGS, ref);
    expect(soon.effectiveStatus).toBe('maturing_soon');
    expect(soon.daysUntilMaturity).toBe(20);

    const later = enrichDeposit(makeDeposit({ maturityDate: '2027-07-18' }), DEFAULT_SETTINGS, ref);
    expect(later.effectiveStatus).toBe('active');

    const matured = enrichDeposit(
      makeDeposit({ maturityDate: '2026-12-12', status: 'matured' }),
      DEFAULT_SETTINGS,
      ref,
    );
    expect(matured.effectiveStatus).toBe('matured');
  });

  it('identifies rollover candidates when remainingYears >= min and totalRate < max', () => {
    const ref = '2026-11-22';
    const lowLong = enrichDeposit(
      makeDeposit({ maturityDate: '2030-04-02', totalRate: 0.7 }),
      DEFAULT_SETTINGS,
      ref,
    );
    expect(lowLong.isRolloverCandidate).toBe(true);

    const highLong = enrichDeposit(
      makeDeposit({ maturityDate: '2030-04-02', totalRate: 1.5 }),
      DEFAULT_SETTINGS,
      ref,
    );
    expect(highLong.isRolloverCandidate).toBe(false);
  });

  it('calculates portfolio summary excluding matured and rolled_over deposits', () => {
    const ref = '2026-11-22';
    const computed = enrichDeposits(
      [
        makeDeposit({ id: '1', bankName: 'A銀行', amount: 1_000_000, totalRate: 1.0, maturityDate: '2026-12-12' }),
        makeDeposit({ id: '2', bankName: 'B銀行', amount: 2_000_000, totalRate: 1.5, maturityDate: '2029-07-04' }),
        makeDeposit({ id: '3', bankName: 'B銀行', amount: 500_000, totalRate: 0.8, status: 'rolled_over' }),
        makeDeposit({ id: '4', bankName: 'C銀行', amount: 0, totalRate: 0.65, status: 'matured' }),
      ],
      DEFAULT_SETTINGS,
      ref,
    );

    const summary = summarizePortfolio(computed);
    expect(summary.totalActiveAmount).toBe(3_000_000);
    expect(summary.activeCount).toBe(2);
    expect(summary.maturingSoonCount).toBe(1);
    expect(summary.maturingSoonAmount).toBe(1_000_000);
    expect(summary.inactiveCount).toBe(2);
    expect(summary.weightedAverageRate).toBe(1.333);

    const byYear = summarizeByMaturityYear(computed);
    expect(byYear).toEqual([
      { year: '2026', amount: 1_000_000, count: 1 },
      { year: '2029', amount: 2_000_000, count: 1 },
    ]);
  });

  it('builds trace chain from any node in a rollover chain', () => {
    const computed = enrichDeposits([
      makeDeposit({ id: 'a', status: 'rolled_over', rolledOverToId: 'b' }),
      makeDeposit({ id: 'b', status: 'rolled_over', parentDepositId: 'a', rolledOverToId: 'c' }),
      makeDeposit({ id: 'c', status: 'active', parentDepositId: 'b' }),
    ]);

    expect(getDepositTraceChain('b', computed).map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(getDepositTraceChain('c', computed).map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('computes gross and net estimated interest', () => {
    const { gross, net } = calculateEstimatedInterest(1_000_000, 1.0, 1);
    expect(gross).toBe(10_000);
    expect(net).toBe(7_968);
  });
});
