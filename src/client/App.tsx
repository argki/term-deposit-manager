import {
  ChevronDown,
  ChevronUp,
  Landmark,
  Plus,
  Redo2,
  Settings,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  enrichDeposits,
  summarizeByMaturityYear,
  summarizePortfolio,
} from '../shared/deposits.js';
import type { DepositStore, DepositWithComputed, RolloverRequest } from '../shared/types.js';
import {
  createDeposit,
  deleteDeposit,
  fetchStore,
  importCsv,
  importJsonBackup,
  matureDeposit,
  replaceStore,
  rolloverDeposit,
  subscribeStoreEvents,
  updateDeposit,
  updateSettings,
  type CreateDepositInput,
} from './api.js';
import { DataTransferModal } from './components/DataTransferModal.js';
import { DepositFormModal } from './components/DepositFormModal.js';
import { DepositTable } from './components/DepositTable.js';
import { SummaryDashboard } from './components/SummaryDashboard.js';
import { TraceModal } from './components/TraceModal.js';

type StatusFilter = 'all' | 'maturing_soon' | 'rollover_candidate';
type SortKey = 'maturity_asc' | 'maturity_desc' | 'rate_asc' | 'rate_desc' | 'amount_desc' | 'bank';

export function App() {
  const [store, setStore] = useState<DepositStore | null>(null);
  const [undoStack, setUndoStack] = useState<DepositStore[]>([]);
  const [redoStack, setRedoStack] = useState<DepositStore[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [bankFilter, setBankFilter] = useState<string>('ALL');
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [sortKey, setSortKey] = useState<SortKey>('maturity_asc');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');

  const [formModal, setFormModal] = useState<{
    mode: 'create' | 'edit' | 'rollover';
    deposit?: DepositWithComputed;
  } | null>(null);
  const [traceTarget, setTraceTarget] = useState<DepositWithComputed | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const isFormOpenRef = useRef(false);
  const deferredSyncRef = useRef(false);

  const loadLatest = useCallback(async () => {
    try {
      const loaded = await fetchStore();
      setStore(loaded);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました。');
    }
  }, []);

  useEffect(() => {
    isFormOpenRef.current = formModal !== null;
    if (!formModal && deferredSyncRef.current) {
      deferredSyncRef.current = false;
      void loadLatest();
    }
  }, [formModal, loadLatest]);

  useEffect(() => {
    let cancelled = false;
    fetchStore()
      .then((loaded) => {
        if (cancelled) return;
        setStore(loaded);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました。');
      });
    const handleSyncSignal = () => {
      if (isFormOpenRef.current) {
        deferredSyncRef.current = true;
        return;
      }
      void loadLatest();
    };
    const unsubscribe = subscribeStoreEvents(handleSyncSignal, handleSyncSignal);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadLatest]);

  const applyMutation = useCallback(
    async (action: () => Promise<DepositStore>, successMsg?: string) => {
      if (!store) return;
      setError(null);
      setSaving(true);
      try {
        const snapshot = store;
        const next = await action();
        setUndoStack((prev) => [...prev.slice(-29), snapshot]);
        setRedoStack([]);
        setStore(next);
        if (successMsg) {
          setNotice(successMsg);
        }
      } finally {
        setSaving(false);
      }
    },
    [store],
  );

  const handleUndo = useCallback(async () => {
    if (!store || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1]!;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, store]);
    setSaving(true);
    try {
      const saved = await replaceStore(prev);
      setStore(saved);
      setNotice('操作を元に戻しました。');
    } finally {
      setSaving(false);
    }
  }, [store, undoStack]);

  const handleRedo = useCallback(async () => {
    if (!store || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, store]);
    setSaving(true);
    try {
      const saved = await replaceStore(next);
      setStore(saved);
      setNotice('操作をやり直しました。');
    } finally {
      setSaving(false);
    }
  }, [store, redoStack]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') {
        if (formModal) setFormModal(null);
        else if (traceTarget) setTraceTarget(null);
        else if (showTransferModal) setShowTransferModal(false);
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, formModal, traceTarget, showTransferModal]);

  const enriched = useMemo(() => {
    if (!store) return [];
    return enrichDeposits(store.deposits, store.settings);
  }, [store]);

  const summary = useMemo(() => summarizePortfolio(enriched), [enriched]);
  const maturityBuckets = useMemo(() => summarizeByMaturityYear(enriched), [enriched]);

  const banks = useMemo(() => {
    const set = new Set(enriched.map((d) => d.bankName));
    return Array.from(set);
  }, [enriched]);

  const filteredAndSorted = useMemo(() => {
    const filtered = enriched.filter((d) => {
      const isInactive = d.effectiveStatus === 'matured' || d.effectiveStatus === 'rolled_over';
      if (!showInactive && isInactive) return false;
      if (bankFilter !== 'ALL' && d.bankName !== bankFilter) return false;
      if (statusFilter === 'maturing_soon' && d.effectiveStatus !== 'maturing_soon') return false;
      if (statusFilter === 'rollover_candidate' && !d.isRolloverCandidate) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'maturity_asc':
          return a.maturityDate.localeCompare(b.maturityDate);
        case 'maturity_desc':
          return b.maturityDate.localeCompare(a.maturityDate);
        case 'rate_asc':
          return a.totalRate - b.totalRate;
        case 'rate_desc':
          return b.totalRate - a.totalRate;
        case 'amount_desc':
          return b.amount - a.amount;
        case 'bank':
          return a.bankName.localeCompare(b.bankName) || a.maturityDate.localeCompare(b.maturityDate);
      }
    });
  }, [enriched, showInactive, bankFilter, statusFilter, sortKey]);

  if (!store) {
    return (
      <div className="app-shell">
        {error ? <div className="banner banner-error">{error}</div> : <p>読み込み中...</p>}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title-group">
          <h1>
            <Landmark size={24} color="#0f766e" />
            定期預金マネージャー
          </h1>
          <p>満期管理・積替トレース・低金利預金の見直しを一元管理</p>
        </div>

        <div className="header-actions">
          <span className={`save-badge ${saving ? 'saving' : ''}`}>
            {saving ? '保存中...' : 'ローカル保存済み'}
          </span>
          <button
            type="button"
            className="btn"
            disabled={undoStack.length === 0}
            onClick={() => void handleUndo()}
            title="元に戻す (Ctrl+Z)"
          >
            <Undo2 size={15} />
            元に戻す
          </button>
          <button
            type="button"
            className="btn"
            disabled={redoStack.length === 0}
            onClick={() => void handleRedo()}
            title="やり直す (Ctrl+Y)"
          >
            <Redo2 size={15} />
            やり直す
          </button>
        </div>
      </header>

      {error && (
        <div className="banner banner-error">
          <span>{error}</span>
          <button type="button" className="btn btn-sm" onClick={() => setError(null)}>
            閉じる
          </button>
        </div>
      )}

      {notice && (
        <div className="banner banner-info">
          <span>{notice}</span>
          <button type="button" className="btn btn-sm" onClick={() => setNotice(null)}>
            閉じる
          </button>
        </div>
      )}

      <SummaryDashboard
        summary={summary}
        maturityBuckets={maturityBuckets}
        onSelectFilter={(f) => setStatusFilter(f)}
        onSelectBank={(bankName) =>
          setBankFilter((prev) => (prev === bankName ? 'ALL' : bankName))
        }
      />

      <section className="toolbar-card">
        <div className="toolbar-row">
          <div className="filter-pills">
            <button
              type="button"
              className={`pill ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              すべて
            </button>
            <button
              type="button"
              className={`pill pill-soon ${statusFilter === 'maturing_soon' ? 'active' : ''}`}
              onClick={() => setStatusFilter('maturing_soon')}
            >
              まもなく満期 ({summary.maturingSoonCount})
            </button>
            <button
              type="button"
              className={`pill pill-candidate ${
                statusFilter === 'rollover_candidate' ? 'active' : ''
              }`}
              onClick={() => setStatusFilter('rollover_candidate')}
            >
              積替検討候補 ({summary.rolloverCandidateCount})
            </button>
          </div>

          <div className="toolbar-controls">
            <select
              className="select"
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              aria-label="銀行フィルタ"
            >
              <option value="ALL">すべての銀行</option>
              {banks.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <select
              className="select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="並び替え"
            >
              <option value="maturity_asc">満期日が近い順</option>
              <option value="maturity_desc">満期日が遠い順</option>
              <option value="rate_asc">金利が低い順（積替検討）</option>
              <option value="rate_desc">金利が高い順</option>
              <option value="amount_desc">金額が大きい順</option>
              <option value="bank">銀行名順</option>
            </select>

            <select
              className="select"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'flat' | 'grouped')}
              aria-label="表示形式"
            >
              <option value="flat">統合一覧</option>
              <option value="grouped">銀行別グループ</option>
            </select>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              満期終了・積替済（無効）を表示
            </label>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setFormModal({ mode: 'create' })}
            >
              <Plus size={16} />
              新規登録
            </button>
          </div>
        </div>
      </section>

      <DepositTable
        deposits={filteredAndSorted}
        viewMode={viewMode}
        bankSummaries={summary.byBank}
        onEdit={(dep) => setFormModal({ mode: 'edit', deposit: dep })}
        onRollover={(dep) => setFormModal({ mode: 'rollover', deposit: dep })}
        onMature={(dep) => {
          const input = window.prompt(
            `${dep.bankName} (${dep.maturityDate}) を満期終了にします。\n受取利息（円）があれば入力してください（空欄可）:`,
            dep.maturityInterest !== null ? String(dep.maturityInterest) : '',
          );
          if (input === null) return;
          const interest = input.trim() ? Number(input.trim()) : null;
          void applyMutation(
            () => matureDeposit(dep.id, Number.isFinite(interest) ? interest : null),
            '満期終了として記録しました。',
          );
        }}
        onDelete={(dep) => {
          const hasLink = dep.parentDepositId !== null || dep.rolledOverToId !== null;
          const linkNote = hasLink
            ? '\n※ この預金には積替元・積替先の履歴リンクがあります。削除すると関連預金のリンクが解除されます（Ctrl+Z で元に戻せます）。'
            : '';
          if (
            !window.confirm(
              `${dep.bankName}（${dep.maturityDate} / ${dep.amount.toLocaleString()}円）を削除しますか？${linkNote}`,
            )
          ) {
            return;
          }
          void applyMutation(() => deleteDeposit(dep.id), '定期預金データを削除しました。');
        }}
        onShowTrace={(dep) => setTraceTarget(dep)}
      />

      <section className="collapsible-card" style={{ marginTop: 18 }}>
        <div className="collapsible-toggle-row">
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            データ移行・バックアップ・設定（CSV取込 / JSON復元 / しきい値）
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setAdminOpen((v) => !v)}
            aria-expanded={adminOpen}
          >
            {adminOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {adminOpen ? '閉じる' : '開く'}
          </button>
        </div>
        {adminOpen && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowTransferModal(true)}
            >
              <Settings size={15} />
              CSV取込・JSONバックアップ・しきい値設定を開く
            </button>
            <span className="sub-text" style={{ marginTop: 0 }}>
              Excel 書き出し CSV の取り込みや、判定日数・積替基準の変更ができます。
            </span>
          </div>
        )}
      </section>

      {formModal && (
        <DepositFormModal
          mode={formModal.mode}
          initialDeposit={formModal.deposit}
          existingBanks={banks}
          onClose={() => setFormModal(null)}
          onSubmitCreate={async (input: CreateDepositInput) => {
            await applyMutation(
              async () => (await createDeposit(input)).store,
              '定期預金を登録しました。',
            );
          }}
          onSubmitEdit={async (id: string, input: CreateDepositInput) => {
            await applyMutation(() => updateDeposit(id, input), '定期預金を更新しました。');
          }}
          onSubmitRollover={async (sourceId: string, input: RolloverRequest) => {
            await applyMutation(
              () => rolloverDeposit(sourceId, input),
              '積替を登録し、元の預金を「積替済」にしました。',
            );
          }}
        />
      )}

      {traceTarget && (
        <TraceModal
          target={traceTarget}
          allDeposits={enriched}
          onClose={() => setTraceTarget(null)}
        />
      )}

      {showTransferModal && (
        <DataTransferModal
          settings={store.settings}
          onClose={() => setShowTransferModal(false)}
          onImportCsv={async (csvText, mode) => {
            await applyMutation(
              async () => (await importCsv(csvText, mode)).store,
              'CSV データを取り込みました。',
            );
          }}
          onImportJson={async (nextStore) => {
            await applyMutation(
              () => importJsonBackup(nextStore),
              'JSON バックアップを復元しました。',
            );
          }}
          onSaveSettings={async (nextSettings) => {
            await applyMutation(() => updateSettings(nextSettings), '判定しきい値を保存しました。');
          }}
        />
      )}
    </div>
  );
}
