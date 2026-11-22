import type {
  AppSettings,
  CsvImportPreview,
  DepositRecord,
  DepositStore,
  RolloverRequest,
} from '../shared/types.js';

const CLIENT_ID =
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('X-Client-Id', CLIENT_ID);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errBody?.error ?? `通信エラー (${res.status})`);
  }
  return (await res.json()) as T;
}

export function fetchStore(): Promise<DepositStore> {
  return requestJson<DepositStore>('/api/store');
}

export function replaceStore(store: DepositStore): Promise<DepositStore> {
  return requestJson<DepositStore>('/api/store', {
    method: 'PUT',
    body: JSON.stringify(store),
  });
}

export interface CreateDepositInput {
  bankName: string;
  startDate: string | null;
  maturityDate: string;
  termYears: number;
  baseRate: number;
  campaignRate: number;
  totalRate?: number;
  campaignNote: string;
  amount: number;
  maturityInterest: number | null;
}

export function createDeposit(
  input: CreateDepositInput,
): Promise<{ store: DepositStore; created: DepositRecord }> {
  return requestJson('/api/deposits', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDeposit(
  id: string,
  patch: Partial<CreateDepositInput> & { status?: DepositRecord['status'] },
): Promise<DepositStore> {
  return requestJson<DepositStore>(`/api/deposits/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteDeposit(id: string): Promise<DepositStore> {
  return requestJson<DepositStore>(`/api/deposits/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function rolloverDeposit(id: string, input: RolloverRequest): Promise<DepositStore> {
  return requestJson<DepositStore>(`/api/deposits/${encodeURIComponent(id)}/rollover`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function matureDeposit(
  id: string,
  maturityInterest: number | null,
): Promise<DepositStore> {
  return requestJson<DepositStore>(`/api/deposits/${encodeURIComponent(id)}/mature`, {
    method: 'POST',
    body: JSON.stringify({ maturityInterest }),
  });
}

export function updateSettings(settings: Partial<AppSettings>): Promise<DepositStore> {
  return requestJson<DepositStore>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export function importCsv(
  csvText: string,
  mode: 'replace' | 'append',
): Promise<{ store: DepositStore; preview: CsvImportPreview }> {
  return requestJson('/api/import-csv', {
    method: 'POST',
    body: JSON.stringify({ csvText, mode }),
  });
}

export function importJsonBackup(store: DepositStore): Promise<DepositStore> {
  return requestJson<DepositStore>('/api/import', {
    method: 'POST',
    body: JSON.stringify(store),
  });
}

export function subscribeStoreEvents(
  onRemoteUpdate: () => void,
  onReconnect?: () => void,
): () => void {
  if (typeof EventSource === 'undefined') {
    return () => undefined;
  }
  let hasOpenedOnce = false;
  const source = new EventSource('/api/events');
  source.addEventListener('open', () => {
    if (hasOpenedOnce) {
      onReconnect?.();
    }
    hasOpenedOnce = true;
  });
  source.addEventListener('store-updated', (ev) => {
    try {
      const payload = JSON.parse((ev as MessageEvent<string>).data) as {
        sourceClientId?: string;
      };
      if (payload.sourceClientId === CLIENT_ID) {
        return;
      }
      onRemoteUpdate();
    } catch {
      onRemoteUpdate();
    }
  });
  return () => {
    source.close();
  };
}
