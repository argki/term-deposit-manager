import type {
  AppSettings,
  BankSummary,
  DepositRecord,
  DepositStatus,
  DepositStore,
  DepositWithComputed,
  PortfolioSummary,
  StoredDepositStatus,
} from './types.js';

export const DEFAULT_SETTINGS: AppSettings = {
  maturingSoonDays: 90,
  rolloverCandidateMinYears: 1.0,
  rolloverCandidateMaxRate: 1.0,
};

export function createEmptyStore(): DepositStore {
  return {
    version: 1,
    deposits: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: new Date().toISOString(),
  };
}

const VALID_STORED_STATUSES = new Set<StoredDepositStatus>(['active', 'matured', 'rolled_over']);

export function validateStoreJson(raw: unknown): DepositStore {
  if (!raw || typeof raw !== 'object') {
    throw new Error('ストアデータが不正です（オブジェクトではありません）。');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new Error('サポートされていないストアバージョンです。');
  }
  if (!Array.isArray(obj.deposits)) {
    throw new Error('deposits 配列が不正です。');
  }

  const deposits: DepositRecord[] = obj.deposits.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`deposits[${idx}] が不正です。`);
    }
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id) {
      throw new Error(`deposits[${idx}].id が不正です。`);
    }
    if (typeof r.bankName !== 'string' || !r.bankName.trim()) {
      throw new Error(`deposits[${idx}].bankName が不正です。`);
    }
    if (typeof r.maturityDate !== 'string' || !parseIsoDate(r.maturityDate)) {
      throw new Error(`deposits[${idx}].maturityDate が不正です。`);
    }
    const status = r.status as StoredDepositStatus;
    if (!VALID_STORED_STATUSES.has(status)) {
      throw new Error(`deposits[${idx}].status が不正です。`);
    }

    return {
      id: r.id,
      bankName: r.bankName.trim(),
      startDate: typeof r.startDate === 'string' && parseIsoDate(r.startDate) ? r.startDate : null,
      maturityDate: r.maturityDate,
      termYears: typeof r.termYears === 'number' && Number.isFinite(r.termYears) ? r.termYears : 0,
      baseRate: typeof r.baseRate === 'number' && Number.isFinite(r.baseRate) ? r.baseRate : 0,
      campaignRate:
        typeof r.campaignRate === 'number' && Number.isFinite(r.campaignRate) ? r.campaignRate : 0,
      totalRate: typeof r.totalRate === 'number' && Number.isFinite(r.totalRate) ? r.totalRate : 0,
      campaignNote: typeof r.campaignNote === 'string' ? r.campaignNote : '',
      amount: typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : 0,
      maturityInterest:
        typeof r.maturityInterest === 'number' && Number.isFinite(r.maturityInterest)
          ? r.maturityInterest
          : null,
      status,
      parentDepositId: typeof r.parentDepositId === 'string' ? r.parentDepositId : null,
      rolledOverToId: typeof r.rolledOverToId === 'string' ? r.rolledOverToId : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
    };
  });

  const rawSettings = (obj.settings ?? {}) as Record<string, unknown>;
  const settings: AppSettings = {
    maturingSoonDays:
      typeof rawSettings.maturingSoonDays === 'number' && rawSettings.maturingSoonDays >= 1
        ? rawSettings.maturingSoonDays
        : DEFAULT_SETTINGS.maturingSoonDays,
    rolloverCandidateMinYears:
      typeof rawSettings.rolloverCandidateMinYears === 'number' &&
      rawSettings.rolloverCandidateMinYears >= 0
        ? rawSettings.rolloverCandidateMinYears
        : DEFAULT_SETTINGS.rolloverCandidateMinYears,
    rolloverCandidateMaxRate:
      typeof rawSettings.rolloverCandidateMaxRate === 'number' &&
      rawSettings.rolloverCandidateMaxRate >= 0
        ? rawSettings.rolloverCandidateMaxRate
        : DEFAULT_SETTINGS.rolloverCandidateMaxRate,
  };

  return {
    version: 1,
    deposits,
    settings,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
  };
}

/** 源泉分離課税率（所得税15.315% + 住民税5%） */
export const JAPAN_DEPOSIT_TAX_RATE = 0.20315;

export function parseIsoDate(dateStr: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

export function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function diffDays(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

export function addYearsToIsoDate(startIso: string, termYears: number): string | null {
  const start = parseIsoDate(startIso);
  if (!start || !Number.isFinite(termYears) || termYears <= 0) return null;
  const wholeYears = Math.floor(termYears);
  const fractionalMonths = Math.round((termYears - wholeYears) * 12);
  const result = new Date(start.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + wholeYears);
  if (fractionalMonths > 0) {
    result.setUTCMonth(result.getUTCMonth() + fractionalMonths);
  }
  return formatIsoDate(result);
}

export function computeEffectiveStatus(
  record: Pick<DepositRecord, 'status' | 'maturityDate'>,
  settings: AppSettings,
  referenceDateIso: string,
): { effectiveStatus: DepositStatus; daysUntilMaturity: number } {
  const daysUntilMaturity = diffDays(referenceDateIso, record.maturityDate);
  if (record.status === 'matured' || record.status === 'rolled_over') {
    return { effectiveStatus: record.status, daysUntilMaturity };
  }
  if (daysUntilMaturity <= settings.maturingSoonDays) {
    return { effectiveStatus: 'maturing_soon', daysUntilMaturity };
  }
  return { effectiveStatus: 'active', daysUntilMaturity };
}

export function enrichDeposit(
  record: DepositRecord,
  settings: AppSettings = DEFAULT_SETTINGS,
  referenceDateIso: string = getTodayIsoDate(),
): DepositWithComputed {
  const { effectiveStatus, daysUntilMaturity } = computeEffectiveStatus(
    record,
    settings,
    referenceDateIso,
  );
  const remainingYears = Math.max(0, Number((daysUntilMaturity / 365).toFixed(2)));
  const isActive = effectiveStatus === 'active' || effectiveStatus === 'maturing_soon';
  const isRolloverCandidate =
    isActive &&
    remainingYears >= settings.rolloverCandidateMinYears &&
    record.totalRate < settings.rolloverCandidateMaxRate;

  return {
    ...record,
    effectiveStatus,
    daysUntilMaturity,
    remainingYears,
    isRolloverCandidate,
  };
}

export function enrichDeposits(
  records: DepositRecord[],
  settings: AppSettings = DEFAULT_SETTINGS,
  referenceDateIso: string = getTodayIsoDate(),
): DepositWithComputed[] {
  return records.map((r) => enrichDeposit(r, settings, referenceDateIso));
}

export function calculateEstimatedInterest(
  amount: number,
  annualRatePercent: number,
  termYears: number,
): { gross: number; net: number } {
  if (amount <= 0 || annualRatePercent <= 0 || termYears <= 0) {
    return { gross: 0, net: 0 };
  }
  const gross = Math.floor(amount * (annualRatePercent / 100) * termYears);
  const net = Math.floor(gross * (1 - JAPAN_DEPOSIT_TAX_RATE));
  return { gross, net };
}

export function summarizePortfolio(deposits: DepositWithComputed[]): PortfolioSummary {
  const bankMap = new Map<
    string,
    {
      activeCount: number;
      maturingSoonCount: number;
      inactiveCount: number;
      totalActiveAmount: number;
      weightedRateNumerator: number;
    }
  >();

  let totalActiveAmount = 0;
  let activeCount = 0;
  let weightedRateNumerator = 0;
  let maturingSoonCount = 0;
  let maturingSoonAmount = 0;
  let rolloverCandidateCount = 0;
  let rolloverCandidateAmount = 0;
  let inactiveCount = 0;

  for (const dep of deposits) {
    let bankEntry = bankMap.get(dep.bankName);
    if (!bankEntry) {
      bankEntry = {
        activeCount: 0,
        maturingSoonCount: 0,
        inactiveCount: 0,
        totalActiveAmount: 0,
        weightedRateNumerator: 0,
      };
      bankMap.set(dep.bankName, bankEntry);
    }

    if (dep.effectiveStatus === 'matured' || dep.effectiveStatus === 'rolled_over') {
      inactiveCount += 1;
      bankEntry.inactiveCount += 1;
      continue;
    }

    activeCount += 1;
    totalActiveAmount += dep.amount;
    weightedRateNumerator += dep.amount * dep.totalRate;

    bankEntry.activeCount += 1;
    bankEntry.totalActiveAmount += dep.amount;
    bankEntry.weightedRateNumerator += dep.amount * dep.totalRate;

    if (dep.effectiveStatus === 'maturing_soon') {
      maturingSoonCount += 1;
      maturingSoonAmount += dep.amount;
      bankEntry.maturingSoonCount += 1;
    }

    if (dep.isRolloverCandidate) {
      rolloverCandidateCount += 1;
      rolloverCandidateAmount += dep.amount;
    }
  }

  const weightedAverageRate =
    totalActiveAmount > 0 ? Number((weightedRateNumerator / totalActiveAmount).toFixed(3)) : 0;

  const byBank: BankSummary[] = Array.from(bankMap.entries()).map(([bankName, b]) => ({
    bankName,
    activeCount: b.activeCount,
    maturingSoonCount: b.maturingSoonCount,
    inactiveCount: b.inactiveCount,
    totalActiveAmount: b.totalActiveAmount,
    weightedAverageRate:
      b.totalActiveAmount > 0
        ? Number((b.weightedRateNumerator / b.totalActiveAmount).toFixed(3))
        : 0,
  }));

  return {
    totalActiveAmount,
    activeCount,
    weightedAverageRate,
    maturingSoonCount,
    maturingSoonAmount,
    rolloverCandidateCount,
    rolloverCandidateAmount,
    inactiveCount,
    byBank,
  };
}

export interface MaturityYearBucket {
  year: string;
  amount: number;
  count: number;
}

export function summarizeByMaturityYear(deposits: DepositWithComputed[]): MaturityYearBucket[] {
  const yearMap = new Map<string, { amount: number; count: number }>();

  for (const dep of deposits) {
    if (dep.effectiveStatus === 'matured' || dep.effectiveStatus === 'rolled_over') {
      continue;
    }
    const year = dep.maturityDate.slice(0, 4);
    const existing = yearMap.get(year) ?? { amount: 0, count: 0 };
    existing.amount += dep.amount;
    existing.count += 1;
    yearMap.set(year, existing);
  }

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, val]) => ({ year, amount: val.amount, count: val.count }));
}

export function getDepositTraceChain(
  depositId: string,
  allDeposits: DepositWithComputed[],
): DepositWithComputed[] {
  const byId = new Map(allDeposits.map((d) => [d.id, d]));
  const start = byId.get(depositId);
  if (!start) return [];

  // Walk backwards to root
  const visited = new Set<string>();
  let root = start;
  while (root.parentDepositId && !visited.has(root.parentDepositId)) {
    visited.add(root.id);
    const parent = byId.get(root.parentDepositId);
    if (!parent) break;
    root = parent;
  }

  // Walk forwards from root
  const chain: DepositWithComputed[] = [];
  const forwardVisited = new Set<string>();
  let current: DepositWithComputed | undefined = root;
  while (current && !forwardVisited.has(current.id)) {
    forwardVisited.add(current.id);
    chain.push(current);
    current = current.rolledOverToId ? byId.get(current.rolledOverToId) : undefined;
  }

  return chain;
}
