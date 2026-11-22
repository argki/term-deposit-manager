import { Download, Upload, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { parseTermDepositCsv } from '../../shared/csvImport.js';
import type { AppSettings, DepositStore } from '../../shared/types.js';

interface DataTransferModalProps {
  settings: AppSettings;
  onClose: () => void;
  onImportCsv: (csvText: string, mode: 'replace' | 'append') => Promise<void>;
  onImportJson: (store: DepositStore) => Promise<void>;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
}

async function decodeCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

export function DataTransferModal({
  settings,
  onClose,
  onImportCsv,
  onImportJson,
  onSaveSettings,
}: DataTransferModalProps) {
  const [tab, setTab] = useState<'csv' | 'backup' | 'settings'>('csv');
  const [csvText, setCsvText] = useState('');
  const [csvMode, setCsvMode] = useState<'replace' | 'append'>('replace');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [maturingDays, setMaturingDays] = useState(String(settings.maturingSoonDays));
  const [minYears, setMinYears] = useState(String(settings.rolloverCandidateMinYears));
  const [maxRate, setMaxRate] = useState(String(settings.rolloverCandidateMaxRate));

  const csvPreview = useMemo(() => {
    if (!csvText.trim()) return null;
    try {
      return parseTermDepositCsv(csvText);
    } catch {
      return null;
    }
  }, [csvText]);

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await decodeCsvFile(file);
    setCsvText(text);
  };

  const handleExecCsv = async () => {
    setError(null);
    setBusy(true);
    try {
      await onImportCsv(csvText, csvMode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV インポートに失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as DepositStore;
      await onImportJson(parsed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'JSON 復元に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSaveSettings({
        maturingSoonDays: Math.max(1, Number(maturingDays) || 90),
        rolloverCandidateMinYears: Math.max(0, Number(minYears) || 1.0),
        rolloverCandidateMaxRate: Math.max(0, Number(maxRate) || 1.0),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>データ移行・バックアップ・設定</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </div>

        <div className="filter-pills" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={`pill ${tab === 'csv' ? 'active' : ''}`}
            onClick={() => setTab('csv')}
          >
            CSV 取込
          </button>
          <button
            type="button"
            className={`pill ${tab === 'backup' ? 'active' : ''}`}
            onClick={() => setTab('backup')}
          >
            エクスポート・復元
          </button>
          <button
            type="button"
            className={`pill ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            判定しきい値設定
          </button>
        </div>

        {error && <div className="banner banner-error">{error}</div>}

        {tab === 'csv' && (
          <div>
            <p className="sub-text" style={{ marginBottom: 10 }}>
              Excel から書き出した定期預金一覧 CSV を選択すると、積替元・積替先の親子関係や満期終了ステータスを自動解析して取り込みます。
            </p>
            <div className="form-field" style={{ marginBottom: 10 }}>
              <label htmlFor="csv-file">CSV ファイルを選択</label>
              <input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleCsvFile} />
            </div>
            <div className="form-field" style={{ marginBottom: 10 }}>
              <label htmlFor="csv-mode">取り込み方法</label>
              <select
                id="csv-mode"
                className="select"
                value={csvMode}
                onChange={(e) => setCsvMode(e.target.value as 'replace' | 'append')}
              >
                <option value="replace">既存データを置き換えて取り込む</option>
                <option value="append">既存データに追加する</option>
              </select>
            </div>

            {csvPreview && (
              <div className="banner banner-info" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <div>
                  <strong>プレビュー:</strong> 運用中 {csvPreview.activeCount} 件（合計{' '}
                  {csvPreview.grandTotal.toLocaleString('ja-JP')} 円）／ 満期終了{' '}
                  {csvPreview.maturedCount} 件 ／ 積替済 {csvPreview.rolledOverCount} 件
                </div>
                <div className="sub-text">
                  銀行別:{' '}
                  {Object.entries(csvPreview.bankTotals)
                    .map(([k, v]) => `${k}: ${v.toLocaleString('ja-JP')}円`)
                    .join(' / ')}
                </div>
                {csvPreview.warnings.map((w, i) => (
                  <div key={i} className="sub-text">
                    ※ {w}
                  </div>
                ))}
              </div>
            )}

            <div className="modal-footer">
              <button type="button" className="btn" onClick={onClose}>
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !csvPreview || csvPreview.records.length === 0}
                onClick={handleExecCsv}
              >
                <Upload size={15} />
                {busy ? '取込中...' : 'インポート実行'}
              </button>
            </div>
          </div>
        )}

        {tab === 'backup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>CSV エクスポート（Excel 用）</h3>
              <p className="sub-text" style={{ marginBottom: 8 }}>
                現在の定期預金一覧（ステータス・積替リンク情報含む）を UTF-8 BOM 付き CSV として出力します。
              </p>
              <a className="btn" href="/api/export-csv" download="term-deposits.csv">
                <Download size={15} />
                CSV をダウンロード
              </a>
            </div>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>JSON バックアップ出力</h3>
              <p className="sub-text" style={{ marginBottom: 8 }}>
                現在の全預金データ・積替履歴・設定を JSON ファイルとして保存します。
              </p>
              <a className="btn btn-primary" href="/api/export" download="term-deposits-backup.json">
                <Download size={15} />
                JSON をダウンロード
              </a>
            </div>
            <div>
              <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>JSON バックアップ復元</h3>
              <input type="file" accept=".json,application/json" onChange={handleJsonFile} disabled={busy} />
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <form onSubmit={handleSaveSettings}>
            <div className="form-grid">
              <div className="form-field full">
                <label htmlFor="set-soon">「まもなく満期」と判定する残日数（日以内）</label>
                <input
                  id="set-soon"
                  className="input"
                  type="number"
                  min={1}
                  value={maturingDays}
                  onChange={(e) => setMaturingDays(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="set-min-years">積替検討候補：最小残存期間（年）</label>
                <input
                  id="set-min-years"
                  className="input"
                  type="number"
                  min={0}
                  step={0.1}
                  value={minYears}
                  onChange={(e) => setMinYears(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="set-max-rate">積替検討候補：最大金利（%未満）</label>
                <input
                  id="set-max-rate"
                  className="input"
                  type="number"
                  min={0}
                  step={0.05}
                  value={maxRate}
                  onChange={(e) => setMaxRate(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={onClose}>
                キャンセル
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                設定を保存
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
