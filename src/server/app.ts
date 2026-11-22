import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { exportDepositsToCsv } from '../shared/csvExport.js';
import { parseTermDepositCsv } from '../shared/csvImport.js';
import { parseIsoDate, validateStoreJson } from '../shared/deposits.js';
import type {
  AppSettings,
  DepositRecord,
  RolloverRequest,
  StoredDepositStatus,
} from '../shared/types.js';
import { createStoreEventBus, type StoreEventBus } from './events.js';
import type { StoreRepository } from './store.js';

const SSE_HEARTBEAT_MS = 25_000;
const SERVER_STARTED_AT = new Date().toISOString();

class HttpError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeDepositInput(body: Record<string, unknown>, nowIso: string): DepositRecord {
  const bankName = typeof body.bankName === 'string' ? body.bankName.trim() : '';
  if (!bankName) {
    throw new HttpError(400, '銀行名を入力してください。');
  }
  const maturityDate = typeof body.maturityDate === 'string' ? body.maturityDate.trim() : '';
  if (!parseIsoDate(maturityDate)) {
    throw new HttpError(400, '満期日は YYYY-MM-DD 形式で入力してください。');
  }
  const startDate =
    typeof body.startDate === 'string' && body.startDate.trim()
      ? body.startDate.trim()
      : null;
  if (startDate && !parseIsoDate(startDate)) {
    throw new HttpError(400, '預入日は YYYY-MM-DD 形式で入力してください。');
  }

  const termYears = toFiniteNumber(body.termYears, 0);
  const baseRate = toFiniteNumber(body.baseRate, 0);
  const campaignRate = toFiniteNumber(body.campaignRate, 0);
  const totalRate =
    typeof body.totalRate === 'number' && Number.isFinite(body.totalRate)
      ? body.totalRate
      : Number((baseRate + campaignRate).toFixed(4));
  const amount = toFiniteNumber(body.amount, 0);
  if (amount < 0) {
    throw new HttpError(400, '金額は 0 以上で入力してください。');
  }

  const status: StoredDepositStatus =
    body.status === 'matured' || body.status === 'rolled_over' ? body.status : 'active';

  return {
    id: globalThis.crypto.randomUUID(),
    bankName,
    startDate,
    maturityDate,
    termYears,
    baseRate,
    campaignRate,
    totalRate,
    campaignNote: typeof body.campaignNote === 'string' ? body.campaignNote.trim() : '',
    amount,
    maturityInterest:
      typeof body.maturityInterest === 'number' && Number.isFinite(body.maturityInterest)
        ? body.maturityInterest
        : null,
    status,
    parentDepositId: typeof body.parentDepositId === 'string' ? body.parentDepositId : null,
    rolledOverToId: typeof body.rolledOverToId === 'string' ? body.rolledOverToId : null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function createApp(
  repo: StoreRepository,
  clientDistDir?: string,
  eventBus: StoreEventBus = createStoreEventBus(),
): Hono {
  const app = new Hono();

  const publishStoreUpdate = (c: Context, updatedAt: string) => {
    const sourceClientId = c.req.header('x-client-id')?.trim() || undefined;
    eventBus.publish({ updatedAt, sourceClientId });
  };

  app.get('/api/health', (c) => {
    c.header('Access-Control-Allow-Origin', '*');
    return c.json({
      ok: true,
      timestamp: new Date().toISOString(),
      startedAt: SERVER_STARTED_AT,
    });
  });

  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      let closed = false;

      const unsubscribe = eventBus.subscribe((event) => {
        if (closed) return;
        void stream.writeSSE({
          event: 'store-updated',
          data: JSON.stringify(event),
        });
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        void stream.writeSSE({
          event: 'ping',
          data: '',
        });
      }, SSE_HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      };

      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ ok: true }),
      });

      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener(
          'abort',
          () => {
            cleanup();
            resolve();
          },
          { once: true },
        );
      });
    });
  });

  app.get('/api/store', async (c) => {
    const store = await repo.load();
    return c.json(store);
  });

  app.put('/api/store', async (c) => {
    try {
      const body: unknown = await c.req.json();
      const validated = validateStoreJson(body);
      const saved = await repo.save(validated);
      publishStoreUpdate(c, saved.updatedAt);
      return c.json(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ストア更新に失敗しました。';
      return c.json({ error: message }, 400);
    }
  });

  app.post('/api/deposits', async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const nowIso = new Date().toISOString();
      const created = normalizeDepositInput(body, nowIso);
      const saved = await repo.update((current) => ({
        ...current,
        deposits: [...current.deposits, created],
      }));
      publishStoreUpdate(c, saved.updatedAt);
      return c.json({ store: saved, created }, 201);
    } catch (error) {
      if (error instanceof HttpError) {
        return c.json({ error: error.message }, error.status);
      }
      return c.json({ error: '預金の登録に失敗しました。' }, 400);
    }
  });

  app.patch('/api/deposits/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const patch = (await c.req.json()) as Record<string, unknown>;
      const nowIso = new Date().toISOString();

      const saved = await repo.update((current) => {
        const index = current.deposits.findIndex((d) => d.id === id);
        if (index === -1) {
          throw new HttpError(404, '対象の定期預金が見つかりません。');
        }
        const existing = current.deposits[index]!;
        const merged = normalizeDepositInput({ ...existing, ...patch }, nowIso);
        const updatedRecord: DepositRecord = {
          ...merged,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: nowIso,
        };
        const deposits = [...current.deposits];
        deposits[index] = updatedRecord;
        return { ...current, deposits };
      });
      publishStoreUpdate(c, saved.updatedAt);
      return c.json(saved);
    } catch (error) {
      if (error instanceof HttpError) {
        return c.json({ error: error.message }, error.status);
      }
      return c.json({ error: '預金の更新に失敗しました。' }, 400);
    }
  });

  app.delete('/api/deposits/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const saved = await repo.update((current) => {
        const target = current.deposits.find((d) => d.id === id);
        if (!target) {
          throw new HttpError(404, '対象の定期預金が見つかりません。');
        }
        const deposits = current.deposits
          .filter((d) => d.id !== id)
          .map((d) => {
            if (d.rolledOverToId === id) {
              return { ...d, rolledOverToId: null };
            }
            if (d.parentDepositId === id) {
              return { ...d, parentDepositId: null };
            }
            return d;
          });
        return { ...current, deposits };
      });
      publishStoreUpdate(c, saved.updatedAt);
      return c.json(saved);
    } catch (error) {
      if (error instanceof HttpError) {
        return c.json({ error: error.message }, error.status);
      }
      return c.json({ error: '預金の削除に失敗しました。' }, 400);
    }
  });

  app.post('/api/deposits/:id/rollover', async (c) => {
    const sourceId = c.req.param('id');
    try {
      const body = (await c.req.json()) as Partial<RolloverRequest>;
      const nowIso = new Date().toISOString();

      const saved = await repo.update((current) => {
        const sourceIndex = current.deposits.findIndex((d) => d.id === sourceId);
        if (sourceIndex === -1) {
          throw new HttpError(404, '積替元の定期預金が見つかりません。');
        }
        const source = current.deposits[sourceIndex]!;
        if (source.status !== 'active') {
          throw new HttpError(400, '運用中の定期預金のみ積替できます。');
        }

        const newRecord = normalizeDepositInput(
          {
            bankName: body.bankName ?? source.bankName,
            startDate: body.startDate ?? null,
            maturityDate: body.maturityDate,
            termYears: body.termYears ?? source.termYears,
            baseRate: body.baseRate ?? 0,
            campaignRate: body.campaignRate ?? 0,
            campaignNote: body.campaignNote ?? '',
            amount: body.amount ?? source.amount,
            status: 'active',
            parentDepositId: source.id,
            rolledOverToId: null,
          },
          nowIso,
        );

        const updatedSource: DepositRecord = {
          ...source,
          status: 'rolled_over',
          rolledOverToId: newRecord.id,
          maturityInterest:
            typeof body.settledInterest === 'number' && Number.isFinite(body.settledInterest)
              ? body.settledInterest
              : source.maturityInterest,
          updatedAt: nowIso,
        };

        const deposits = [...current.deposits];
        deposits[sourceIndex] = updatedSource;
        deposits.push(newRecord);
        return { ...current, deposits };
      });

      publishStoreUpdate(c, saved.updatedAt);
      return c.json(saved, 201);
    } catch (error) {
      if (error instanceof HttpError) {
        return c.json({ error: error.message }, error.status);
      }
      return c.json({ error: '積替登録に失敗しました。' }, 400);
    }
  });

  app.post('/api/deposits/:id/mature', async (c) => {
    const id = c.req.param('id');
    try {
      const body = (await c.req.json().catch(() => ({}))) as { maturityInterest?: number | null };
      const nowIso = new Date().toISOString();

      const saved = await repo.update((current) => {
        const index = current.deposits.findIndex((d) => d.id === id);
        if (index === -1) {
          throw new HttpError(404, '対象の定期預金が見つかりません。');
        }
        const existing = current.deposits[index]!;
        const deposits = [...current.deposits];
        deposits[index] = {
          ...existing,
          status: 'matured',
          maturityInterest:
            typeof body.maturityInterest === 'number' && Number.isFinite(body.maturityInterest)
              ? body.maturityInterest
              : existing.maturityInterest,
          updatedAt: nowIso,
        };
        return { ...current, deposits };
      });

      publishStoreUpdate(c, saved.updatedAt);
      return c.json(saved);
    } catch (error) {
      if (error instanceof HttpError) {
        return c.json({ error: error.message }, error.status);
      }
      return c.json({ error: '満期終了処理に失敗しました。' }, 400);
    }
  });

  app.put('/api/settings', async (c) => {
    try {
      const body = (await c.req.json()) as Partial<AppSettings>;
      const saved = await repo.update((current) => {
        const nextSettings: AppSettings = {
          maturingSoonDays:
            typeof body.maturingSoonDays === 'number' && body.maturingSoonDays >= 1
              ? Math.floor(body.maturingSoonDays)
              : current.settings.maturingSoonDays,
          rolloverCandidateMinYears:
            typeof body.rolloverCandidateMinYears === 'number' &&
            body.rolloverCandidateMinYears >= 0
              ? body.rolloverCandidateMinYears
              : current.settings.rolloverCandidateMinYears,
          rolloverCandidateMaxRate:
            typeof body.rolloverCandidateMaxRate === 'number' &&
            body.rolloverCandidateMaxRate >= 0
              ? body.rolloverCandidateMaxRate
              : current.settings.rolloverCandidateMaxRate,
        };
        return { ...current, settings: nextSettings };
      });
      publishStoreUpdate(c, saved.updatedAt);
      return c.json(saved);
    } catch {
      return c.json({ error: '設定の更新に失敗しました。' }, 400);
    }
  });

  app.post('/api/import-csv', async (c) => {
    try {
      const body = (await c.req.json()) as { csvText?: string; mode?: 'replace' | 'append' };
      if (!body.csvText || typeof body.csvText !== 'string') {
        return c.json({ error: 'CSV テキストが空です。' }, 400);
      }
      const preview = parseTermDepositCsv(body.csvText);
      if (preview.records.length === 0) {
        return c.json({ error: '取り込める定期預金レコードが見つかりませんでした。' }, 400);
      }
      const mode = body.mode === 'append' ? 'append' : 'replace';
      const saved = await repo.update((current) => ({
        ...current,
        deposits: mode === 'append' ? [...current.deposits, ...preview.records] : preview.records,
      }));
      publishStoreUpdate(c, saved.updatedAt);
      return c.json({ store: saved, preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CSV インポートに失敗しました。';
      return c.json({ error: message }, 400);
    }
  });

  app.get('/api/export', async (c) => {
    const store = await repo.load();
    c.header('Content-Disposition', 'attachment; filename="term-deposits-backup.json"');
    return c.json(store);
  });

  app.get('/api/export-csv', async (c) => {
    const store = await repo.load();
    const csv = exportDepositsToCsv(store.deposits, store.settings);
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="term-deposits.csv"');
    return c.body(csv);
  });

  app.post('/api/import', async (c) => {
    try {
      const body: unknown = await c.req.json();
      const validated = validateStoreJson(body);
      const saved = await repo.save(validated);
      publishStoreUpdate(c, saved.updatedAt);
      return c.json(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON インポートに失敗しました。';
      return c.json({ error: message }, 400);
    }
  });

  if (clientDistDir && fs.existsSync(clientDistDir)) {
    app.use('/*', serveStatic({ root: path.relative(process.cwd(), clientDistDir) || '.' }));
    app.get('*', (c) => {
      if (c.req.path.startsWith('/api/')) {
        return c.json({ error: 'Not Found' }, 404);
      }
      const indexPath = path.join(clientDistDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        return c.html(fs.readFileSync(indexPath, 'utf8'));
      }
      return c.notFound();
    });
  }

  return app;
}
