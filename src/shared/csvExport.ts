import { enrichDeposits } from './deposits.js';
import type { AppSettings, DepositRecord, DepositStatus } from './types.js';

const STATUS_LABELS: Record<DepositStatus, string> = {
  active: '運用中',
  maturing_soon: 'まもなく満期',
  matured: '満期終了',
  rolled_over: '積替済',
};

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportDepositsToCsv(
  deposits: DepositRecord[],
  settings: AppSettings,
  referenceDateIso?: string,
): string {
  const enriched = enrichDeposits(deposits, settings, referenceDateIso);
  const header = [
    '銀行名',
    'ステータス',
    '預入日',
    '満期日',
    '残日数',
    '期間(年)',
    '基本金利(%)',
    '上乗せ金利(%)',
    '合計金利(%)',
    '預入金額(円)',
    '満期利息(円)',
    '積替検討候補',
    'キャンペーン・メモ',
    '積替元ID',
    '積替先ID',
    'ID',
  ].join(',');

  const lines = enriched.map((d) =>
    [
      d.bankName,
      STATUS_LABELS[d.effectiveStatus],
      d.startDate ?? '',
      d.maturityDate,
      d.effectiveStatus === 'active' || d.effectiveStatus === 'maturing_soon'
        ? d.daysUntilMaturity
        : '',
      d.termYears,
      d.baseRate,
      d.campaignRate,
      d.totalRate,
      d.amount,
      d.maturityInterest ?? '',
      d.isRolloverCandidate ? '候補' : '',
      d.campaignNote,
      d.parentDepositId ?? '',
      d.rolledOverToId ?? '',
      d.id,
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}
