import fs from 'node:fs/promises';
import path from 'node:path';
import { createEmptyStore, validateStoreJson } from '../shared/deposits.js';
import type { DepositStore } from '../shared/types.js';

export interface StoreRepository {
  load: () => Promise<DepositStore>;
  save: (store: DepositStore) => Promise<DepositStore>;
  update: (updater: (current: DepositStore) => DepositStore) => Promise<DepositStore>;
}

export function createStoreRepository(dataDir: string): StoreRepository {
  const filePath = path.join(dataDir, 'deposits.json');
  const tempPath = path.join(dataDir, 'deposits.json.tmp');
  let writeQueue: Promise<unknown> = Promise.resolve();

  async function ensureDir(): Promise<void> {
    await fs.mkdir(dataDir, { recursive: true });
  }

  async function loadUnlocked(): Promise<DepositStore> {
    await ensureDir();
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return validateStoreJson(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        const initial = createEmptyStore();
        await saveUnlocked(initial);
        return initial;
      }
      throw error;
    }
  }

  async function saveUnlocked(store: DepositStore): Promise<DepositStore> {
    await ensureDir();
    const next: DepositStore = {
      ...store,
      updatedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(next, null, 2);
    await fs.writeFile(tempPath, json, 'utf8');
    await fs.rename(tempPath, filePath);
    return next;
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = writeQueue.then(task, task);
    writeQueue = run.catch(() => undefined);
    return run;
  }

  return {
    load: () => enqueue(loadUnlocked),
    save: (store) => enqueue(() => saveUnlocked(store)),
    update: (updater) =>
      enqueue(async () => {
        const current = await loadUnlocked();
        const next = updater(current);
        return saveUnlocked(next);
      }),
  };
}
