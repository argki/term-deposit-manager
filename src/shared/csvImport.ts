import type { CsvImportPreview, DepositRecord } from './types.js';

function generateId(): string {
  return globalThis.crypto.randomUUID();
}

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeText(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

function parseNumeric(value: string | undefined): number | null {
  const cleaned = normalizeText(value).replace(/,/g, '').replace(/\s+/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function parseCampaignBlock(
  campaignRaw: string | undefined,
  totalRateRaw: string | undefined,
  baseRate: number,
): { campaignRate: number; totalRate: number; campaignNote: string } {
  const note = normalizeText(campaignRaw).replace(/\.\.+/g, '.');
  const explicitTotal = parseNumeric(totalRateRaw);

  let campaignRate = 0;
  const plusMatch = /\+\s*([0-9]+(?:\.[0-9]+)?)/.exec(note);
  if (plusMatch?.[1]) {
    campaignRate = Number(plusMatch[1]);
  } else if (explicitTotal !== null && explicitTotal > baseRate) {
    campaignRate = Number((explicitTotal - baseRate).toFixed(4));
  }

  const totalRate =
    explicitTotal !== null ? explicitTotal : Number((baseRate + campaignRate).toFixed(4));

  return { campaignRate, totalRate, campaignNote: note };
}

interface ParsedBlock {
  maturityDate: string;
  termYears: number;
  baseRate: number;
  campaignRate: number;
  totalRate: number;
  campaignNote: string;
  amount: number;
  isMaturedText: boolean;
  maturityInterest: number | null;
}

function parseBlock(
  cols: string[],
  offset: number,
): ParsedBlock | null {
  const year = parseNumeric(cols[offset]);
  const month = parseNumeric(cols[offset + 1]);
  const day = parseNumeric(cols[offset + 2]);
  if (year === null || month === null || day === null) {
    return null;
  }
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const maturityDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const termYears = parseNumeric(cols[offset + 4]) ?? 0;
  const baseRate = parseNumeric(cols[offset + 5]) ?? 0;

  const amountText = normalizeText(cols[offset + 6]);
  const isMaturedText = amountText.includes('満期終了');
  const parsedAmount = isMaturedText ? 0 : (parseNumeric(amountText) ?? 0);

  // Column offset+7 can be numeric maturityInterest OR a campaign/note text string
  const rawInterestCol = normalizeText(cols[offset + 7]);
  const numericInterest = parseNumeric(rawInterestCol);
  const interestAsNote = numericInterest === null && rawInterestCol.length > 0 ? rawInterestCol : '';

  const { campaignRate, totalRate, campaignNote } = parseCampaignBlock(
    cols[offset + 8] || interestAsNote,
    cols[offset + 9],
    baseRate,
  );

  return {
    maturityDate,
    termYears,
    baseRate,
    campaignRate,
    totalRate,
    campaignNote: campaignNote || interestAsNote,
    amount: parsedAmount,
    isMaturedText,
    maturityInterest: numericInterest,
  };
}

function areBlocksIdentical(left: ParsedBlock, right: ParsedBlock): boolean {
  return (
    left.maturityDate === right.maturityDate &&
    left.termYears === right.termYears &&
    left.baseRate === right.baseRate &&
    left.amount === right.amount &&
    !left.isMaturedText &&
    !right.isMaturedText
  );
}

export function parseTermDepositCsv(
  csvText: string,
  nowIso: string = new Date().toISOString(),
): CsvImportPreview {
  const rows = parseCsvLines(csvText);
  const records: DepositRecord[] = [];
  const warnings: string[] = [];
  let currentBank = '';

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const cols = rows[rowIndex]!;
    const col0 = normalizeText(cols[0]);

    // Skip header row
    if (rowIndex === 0 && normalizeText(cols[1]).includes('満期')) {
      continue;
    }

    if (col0.length > 0) {
      currentBank = col0;
    }

    const left = parseBlock(cols, 1);
    const right = parseBlock(cols, 11);

    // Subtotal / grand total / empty rows have no maturity date on either side
    if (!left && !right) {
      continue;
    }

    const bankName = currentBank || '未分類';

    if (left && right) {
      if (areBlocksIdentical(left, right)) {
        // Both sides have identical terms (e.g. duplicated entry in Excel where both were active)
        warnings.push(
          `${rowIndex + 1}行目（${bankName} ${left.maturityDate}）: 左右に同一条件の明細があるため、2件の運用中預金として取り込みました。`,
        );
        records.push(
          {
            id: generateId(),
            bankName,
            startDate: null,
            maturityDate: left.maturityDate,
            termYears: left.termYears,
            baseRate: left.baseRate,
            campaignRate: left.campaignRate,
            totalRate: left.totalRate,
            campaignNote: left.campaignNote,
            amount: left.amount,
            maturityInterest: left.maturityInterest,
            status: 'active',
            parentDepositId: null,
            rolledOverToId: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          {
            id: generateId(),
            bankName,
            startDate: null,
            maturityDate: right.maturityDate,
            termYears: right.termYears,
            baseRate: right.baseRate,
            campaignRate: right.campaignRate,
            totalRate: right.totalRate,
            campaignNote: right.campaignNote,
            amount: right.amount,
            maturityInterest: right.maturityInterest,
            status: 'active',
            parentDepositId: null,
            rolledOverToId: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        );
      } else {
        const sourceId = generateId();
        const targetId = generateId();
        records.push(
          {
            id: sourceId,
            bankName,
            startDate: null,
            maturityDate: left.maturityDate,
            termYears: left.termYears,
            baseRate: left.baseRate,
            campaignRate: left.campaignRate,
            totalRate: left.totalRate,
            campaignNote: left.campaignNote,
            amount: left.amount,
            maturityInterest: left.maturityInterest,
            status: 'rolled_over',
            parentDepositId: null,
            rolledOverToId: targetId,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          {
            id: targetId,
            bankName,
            startDate: null,
            maturityDate: right.maturityDate,
            termYears: right.termYears,
            baseRate: right.baseRate,
            campaignRate: right.campaignRate,
            totalRate: right.totalRate,
            campaignNote: right.campaignNote,
            amount: right.amount,
            maturityInterest: right.maturityInterest,
            status: right.isMaturedText ? 'matured' : 'active',
            parentDepositId: sourceId,
            rolledOverToId: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        );
      }
    } else if (left) {
      records.push({
        id: generateId(),
        bankName,
        startDate: null,
        maturityDate: left.maturityDate,
        termYears: left.termYears,
        baseRate: left.baseRate,
        campaignRate: left.campaignRate,
        totalRate: left.totalRate,
        campaignNote: left.campaignNote,
        amount: left.amount,
        maturityInterest: left.maturityInterest,
        status: left.isMaturedText ? 'matured' : 'active',
        parentDepositId: null,
        rolledOverToId: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    } else if (right) {
      records.push({
        id: generateId(),
        bankName,
        startDate: null,
        maturityDate: right.maturityDate,
        termYears: right.termYears,
        baseRate: right.baseRate,
        campaignRate: right.campaignRate,
        totalRate: right.totalRate,
        campaignNote: right.campaignNote,
        amount: right.amount,
        maturityInterest: right.maturityInterest,
        status: right.isMaturedText ? 'matured' : 'active',
        parentDepositId: null,
        rolledOverToId: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  const bankTotals: Record<string, number> = {};
  let grandTotal = 0;
  let activeCount = 0;
  let maturedCount = 0;
  let rolledOverCount = 0;

  for (const r of records) {
    if (r.status === 'active') {
      activeCount += 1;
      grandTotal += r.amount;
      bankTotals[r.bankName] = (bankTotals[r.bankName] ?? 0) + r.amount;
    } else if (r.status === 'matured') {
      maturedCount += 1;
    } else if (r.status === 'rolled_over') {
      rolledOverCount += 1;
    }
  }

  return {
    records,
    bankTotals,
    grandTotal,
    activeCount,
    maturedCount,
    rolledOverCount,
    warnings,
  };
}
