import { describe, expect, it } from 'vitest';
import { parseTermDepositCsv } from './csvImport.js';

const SAMPLE_CSV = [
  ',満期 年 月 日,,,,期間(年),金利(％),金額,満期利息,ｷﾔﾝﾍﾟｰﾝ,,満期 年 月 日,,,,期間(年),金利(％),金額,満期利息,ｷﾔﾝﾍﾟｰﾝ,',
  'A銀行,2026,12,12,,1,1," 500,000 ",,,,,,,,,,,,,',
  ',2027,7,4,,2,0.7," 1,000,000 ",,,,,,,,,,,,,',
  ',,,,,,," 1,500,000 ",,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,',
  'B銀行,2026,5,30,,1,0.65, 満期終了 ," 503,250 ",,,,,,,,,,,,',
  ',2027,1,2,,1,0.8," 500,000 ", 800 ,,,2027,1,4,,0.5,1," 500,000 ",, ◎+0..25 ,1.25',
  ',2028,3,10,,3,0.85," 1,000,000 ", 150 ,,,2027,10,26,,1,1.7," 600,000 ", 特別金利 ,,',
  ',2031,7,4,,5,1.5," 1,000,000 ",,,,2031,7,4,,5,1.5," 1,000,000 ",,,',
  ',,,,,,," 3,100,000 ",,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,',
  'C銀行,2028,4,3,,2,1.4," 800,000 ",,,,,,,,,,,,,',
  ',,,,,,," 800,000 ",,,,,,,,,,,,,',
  ',,,,,,,,,,,,,,,,,,,,',
  ',,,,,,," 5,400,000 ",,,,,,,,,,,,,',
].join('\n');

describe('parseTermDepositCsv', () => {
  it('parses Excel-style CSV matching bank subtotals, rollover links, and campaign normalizations', () => {
    const preview = parseTermDepositCsv(SAMPLE_CSV, '2026-11-22T00:00:00Z');

    expect(preview.grandTotal).toBe(5_400_000);
    expect(preview.bankTotals).toEqual({
      A銀行: 1_500_000,
      B銀行: 3_100_000,
      C銀行: 800_000,
    });
    expect(preview.maturedCount).toBe(1);
    expect(preview.rolledOverCount).toBe(2);
    expect(preview.warnings).toHaveLength(1);

    const byId = new Map(preview.records.map((r) => [r.id, r]));
    const rolledOver = preview.records.filter((r) => r.status === 'rolled_over');
    for (const src of rolledOver) {
      expect(src.rolledOverToId).toBeTruthy();
      const target = byId.get(src.rolledOverToId!);
      expect(target).toBeDefined();
      expect(target!.parentDepositId).toBe(src.id);
    }

    const doubleDotCampaign = preview.records.find(
      (r) => r.bankName === 'B銀行' && r.parentDepositId !== null && r.campaignRate > 0,
    );
    expect(doubleDotCampaign).toBeDefined();
    expect(doubleDotCampaign!.campaignRate).toBe(0.25);
    expect(doubleDotCampaign!.totalRate).toBe(1.25);

    const textNoteRecord = preview.records.find((r) => r.campaignNote.includes('特別金利'));
    expect(textNoteRecord).toBeDefined();
    expect(textNoteRecord!.amount).toBe(600_000);
    expect(textNoteRecord!.maturityInterest).toBeNull();
  });
});
