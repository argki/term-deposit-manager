import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DepositStore } from '../shared/types.js';
import { createApp } from './app.js';
import { createStoreEventBus } from './events.js';
import { createStoreRepository } from './store.js';

const SAMPLE_CSV = [
  ',満期 年 月 日,,,,期間(年),金利(％),金額,満期利息,ｷﾔﾝﾍﾟｰﾝ,,満期 年 月 日,,,,期間(年),金利(％),金額,満期利息,ｷﾔﾝﾍﾟｰﾝ,',
  'A銀行,2026,12,12,,1,1," 1,000,000 ",,,,,,,,,,,,,',
  'B銀行,2027,1,2,,1,0.8," 500,000 ", 800 ,,,2027,1,4,,0.5,1," 500,000 ",, ◎+0.25 ,1.25',
  ',,,,,,," 1,500,000 ",,,,,,,,,,,,,',
].join('\n');

describe('term-deposit-manager API', () => {
  let tempDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdm-api-test-'));
    const repo = createStoreRepository(tempDir);
    app = createApp(repo, undefined, createStoreEventBus());
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns health status and initial empty store', async () => {
    const healthRes = await app.request('/api/health');
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as { ok: boolean };
    expect(health.ok).toBe(true);

    const storeRes = await app.request('/api/store');
    expect(storeRes.status).toBe(200);
    const store = (await storeRes.json()) as DepositStore;
    expect(store.deposits).toEqual([]);
    expect(store.settings.maturingSoonDays).toBe(90);
  });

  it('creates, updates, rolls over, matures, and deletes deposits', async () => {
    const createRes = await app.request('/api/deposits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bankName: 'A銀行',
        startDate: '2026-01-02',
        maturityDate: '2027-01-02',
        termYears: 1,
        baseRate: 1.0,
        campaignRate: 0,
        amount: 1_000_000,
      }),
    });
    expect(createRes.status).toBe(201);
    const { created } = (await createRes.json()) as { created: { id: string } };

    // Rollover
    const rolloverRes = await app.request(`/api/deposits/${created.id}/rollover`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bankName: 'B銀行',
        startDate: '2026-11-22',
        maturityDate: '2027-11-22',
        termYears: 1,
        baseRate: 1.25,
        campaignRate: 0.25,
        campaignNote: 'キャンペーン',
        amount: 1_000_000,
        settledInterest: 800,
      }),
    });
    expect(rolloverRes.status).toBe(201);
    const rolledStore = (await rolloverRes.json()) as DepositStore;
    expect(rolledStore.deposits).toHaveLength(2);
    const source = rolledStore.deposits.find((d) => d.id === created.id)!;
    const target = rolledStore.deposits.find((d) => d.id !== created.id)!;
    expect(source.status).toBe('rolled_over');
    expect(source.rolledOverToId).toBe(target.id);
    expect(source.maturityInterest).toBe(800);
    expect(target.parentDepositId).toBe(source.id);
    expect(target.totalRate).toBe(1.5);

    // Mature target
    const matureRes = await app.request(`/api/deposits/${target.id}/mature`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maturityInterest: 15000 }),
    });
    expect(matureRes.status).toBe(200);
    const maturedStore = (await matureRes.json()) as DepositStore;
    expect(maturedStore.deposits.find((d) => d.id === target.id)!.status).toBe('matured');

    // Delete source
    const deleteRes = await app.request(`/api/deposits/${source.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
    const afterDelete = (await deleteRes.json()) as DepositStore;
    expect(afterDelete.deposits).toHaveLength(1);
    expect(afterDelete.deposits[0]!.parentDepositId).toBeNull();
  });

  it('imports Excel-format CSV, exports JSON backup, and exports UTF-8 BOM CSV', async () => {
    const importRes = await app.request('/api/import-csv', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csvText: SAMPLE_CSV, mode: 'replace' }),
    });
    expect(importRes.status).toBe(200);
    const { preview } = (await importRes.json()) as { preview: { grandTotal: number } };
    expect(preview.grandTotal).toBe(1_500_000);

    const exportRes = await app.request('/api/export');
    expect(exportRes.status).toBe(200);
    const exported = (await exportRes.json()) as DepositStore;
    expect(exported.deposits).toHaveLength(3);

    const csvRes = await app.request('/api/export-csv');
    expect(csvRes.status).toBe(200);
    const csvBytes = new Uint8Array(await csvRes.arrayBuffer());
    expect(Array.from(csvBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csvTextExport = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvBytes);
    expect(csvTextExport.startsWith('\uFEFF銀行名,ステータス,')).toBe(true);
    expect(csvTextExport).toContain('A銀行');
  });
});
