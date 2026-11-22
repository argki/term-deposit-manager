import { X } from 'lucide-react';
import { useState } from 'react';
import { addYearsToIsoDate, calculateEstimatedInterest } from '../../shared/deposits.js';
import type { DepositWithComputed, RolloverRequest } from '../../shared/types.js';
import type { CreateDepositInput } from '../api.js';

interface DepositFormModalProps {
  mode: 'create' | 'edit' | 'rollover';
  initialDeposit?: DepositWithComputed;
  existingBanks: string[];
  onClose: () => void;
  onSubmitCreate: (input: CreateDepositInput) => Promise<void>;
  onSubmitEdit: (id: string, input: CreateDepositInput) => Promise<void>;
  onSubmitRollover: (sourceId: string, input: RolloverRequest) => Promise<void>;
}

export function DepositFormModal({
  mode,
  initialDeposit,
  existingBanks,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
  onSubmitRollover,
}: DepositFormModalProps) {
  const isRollover = mode === 'rollover';
  const isEdit = mode === 'edit';

  const [bankName, setBankName] = useState(initialDeposit?.bankName ?? '');
  const [startDate, setStartDate] = useState(
    isRollover
      ? (initialDeposit?.maturityDate ?? '')
      : (initialDeposit?.startDate ?? ''),
  );
  const [termYears, setTermYears] = useState(
    String(initialDeposit?.termYears ?? 1),
  );
  const [maturityDate, setMaturityDate] = useState(
    isRollover && initialDeposit
      ? (addYearsToIsoDate(initialDeposit.maturityDate, initialDeposit.termYears || 1) ?? '')
      : (initialDeposit?.maturityDate ?? ''),
  );
  const [baseRate, setBaseRate] = useState(
    isRollover ? '' : String(initialDeposit?.baseRate ?? ''),
  );
  const [campaignRate, setCampaignRate] = useState(
    isRollover ? '0' : String(initialDeposit?.campaignRate ?? '0'),
  );
  const [campaignNote, setCampaignNote] = useState(
    isRollover ? '' : (initialDeposit?.campaignNote ?? ''),
  );
  const [amount, setAmount] = useState(String(initialDeposit?.amount ?? ''));
  const [maturityInterest, setMaturityInterest] = useState(
    isEdit && initialDeposit?.maturityInterest !== null && initialDeposit?.maturityInterest !== undefined
      ? String(initialDeposit.maturityInterest)
      : '',
  );
  const [settledInterest, setSettledInterest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const numBase = Number(baseRate) || 0;
  const numCampaign = Number(campaignRate) || 0;
  const totalRate = Number((numBase + numCampaign).toFixed(4));
  const numAmount = Number(amount) || 0;
  const numTerm = Number(termYears) || 0;
  const est = calculateEstimatedInterest(numAmount, totalRate, numTerm);

  const handleAutoCalcMaturity = (nextStart: string, nextTerm: string) => {
    const t = Number(nextTerm);
    if (nextStart && Number.isFinite(t) && t > 0) {
      const calc = addYearsToIsoDate(nextStart, t);
      if (calc) setMaturityDate(calc);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isRollover && initialDeposit) {
        await onSubmitRollover(initialDeposit.id, {
          bankName: bankName.trim(),
          startDate: startDate.trim() || null,
          maturityDate: maturityDate.trim(),
          termYears: numTerm,
          baseRate: numBase,
          campaignRate: numCampaign,
          campaignNote: campaignNote.trim(),
          amount: numAmount,
          settledInterest: settledInterest.trim() ? Number(settledInterest) : null,
        });
      } else {
        const payload: CreateDepositInput = {
          bankName: bankName.trim(),
          startDate: startDate.trim() || null,
          maturityDate: maturityDate.trim(),
          termYears: numTerm,
          baseRate: numBase,
          campaignRate: numCampaign,
          totalRate,
          campaignNote: campaignNote.trim(),
          amount: numAmount,
          maturityInterest: maturityInterest.trim() ? Number(maturityInterest) : null,
        };
        if (isEdit && initialDeposit) {
          await onSubmitEdit(initialDeposit.id, payload);
        } else {
          await onSubmitCreate(payload);
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === 'rollover'
      ? '積替（ロールオーバー）登録'
      : mode === 'edit'
        ? '定期預金の編集'
        : '新規定期預金の登録';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </div>

        {isRollover && initialDeposit && (
          <div className="banner banner-info" style={{ marginBottom: 14 }}>
            <div>
              <strong>積替元:</strong> {initialDeposit.bankName} / 満期{' '}
              {initialDeposit.maturityDate.replace(/-/g, '/')} / 金利{' '}
              {initialDeposit.totalRate.toFixed(2)}% /{' '}
              {initialDeposit.amount.toLocaleString('ja-JP')} 円
              <br />
              <span className="sub-text">
                登録すると積替元は自動的に「積替済（無効）」になり、履歴が紐づきます。
              </span>
            </div>
          </div>
        )}

        {error && <div className="banner banner-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="dep-bank">銀行名 *</label>
              <input
                id="dep-bank"
                className="input"
                list="bank-suggestions"
                required
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="例: A銀行, B銀行"
              />
              <datalist id="bank-suggestions">
                {existingBanks.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div className="form-field">
              <label htmlFor="dep-amount">預入金額（円） *</label>
              <input
                id="dep-amount"
                className="input"
                type="number"
                min={0}
                step={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例: 1000000"
              />
            </div>

            <div className="form-field">
              <label htmlFor="dep-start">預入日（任意・入力すると満期日を自動計算）</label>
              <input
                id="dep-start"
                className="input"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  handleAutoCalcMaturity(e.target.value, termYears);
                }}
              />
            </div>

            <div className="form-field">
              <label htmlFor="dep-term">預入期間（年）</label>
              <input
                id="dep-term"
                className="input"
                type="number"
                min={0.1}
                step={0.1}
                value={termYears}
                onChange={(e) => {
                  setTermYears(e.target.value);
                  handleAutoCalcMaturity(startDate, e.target.value);
                }}
              />
            </div>

            <div className="form-field">
              <label htmlFor="dep-maturity">満期日 *</label>
              <input
                id="dep-maturity"
                className="input"
                type="date"
                required
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="dep-base-rate">基本金利（%） *</label>
              <input
                id="dep-base-rate"
                className="input"
                type="number"
                min={0}
                step={0.01}
                required
                value={baseRate}
                onChange={(e) => setBaseRate(e.target.value)}
                placeholder="例: 1.00"
              />
            </div>

            <div className="form-field">
              <label htmlFor="dep-camp-rate">キャンペーン上乗せ（%）</label>
              <input
                id="dep-camp-rate"
                className="input"
                type="number"
                min={0}
                step={0.01}
                value={campaignRate}
                onChange={(e) => setCampaignRate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="dep-note">キャンペーン名・メモ</label>
              <input
                id="dep-note"
                className="input"
                value={campaignNote}
                onChange={(e) => setCampaignNote(e.target.value)}
                placeholder="例: +0.25%, 特別キャンペーン"
              />
            </div>

            {isRollover ? (
              <div className="form-field full">
                <label htmlFor="dep-settled">積替元の受取利息（円・任意）</label>
                <input
                  id="dep-settled"
                  className="input"
                  type="number"
                  min={0}
                  value={settledInterest}
                  onChange={(e) => setSettledInterest(e.target.value)}
                  placeholder="解約・満期で受け取った利息があれば入力"
                />
              </div>
            ) : (
              <div className="form-field full">
                <label htmlFor="dep-interest">満期利息・実績受取額（円・任意）</label>
                <input
                  id="dep-interest"
                  className="input"
                  type="number"
                  min={0}
                  value={maturityInterest}
                  onChange={(e) => setMaturityInterest(e.target.value)}
                  placeholder="未入力の場合は税引後目安を自動表示します"
                />
              </div>
            )}
          </div>

          <div className="banner banner-info" style={{ marginTop: 14, marginBottom: 0 }}>
            <span>
              適用金利合計: <strong>{totalRate.toFixed(2)}%</strong> ／ 概算満期利息: 税引前{' '}
              <strong>{est.gross.toLocaleString('ja-JP')} 円</strong>・税引後{' '}
              <strong>{est.net.toLocaleString('ja-JP')} 円</strong>
            </span>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '保存中...' : isRollover ? '積替を確定' : '保存する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
