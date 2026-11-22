import { ArrowDown, X } from 'lucide-react';
import { getDepositTraceChain } from '../../shared/deposits.js';
import type { DepositWithComputed } from '../../shared/types.js';
import { formatDateWithWareki } from '../../shared/wareki.js';

interface TraceModalProps {
  target: DepositWithComputed;
  allDeposits: DepositWithComputed[];
  onClose: () => void;
}

export function TraceModal({ target, allDeposits, onClose }: TraceModalProps) {
  const chain = getDepositTraceChain(target.id, allDeposits);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>預入・積替トレース履歴</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </div>

        <div className="trace-list">
          {chain.map((item, idx) => {
            const isCurrent = item.id === target.id;
            const isInactive =
              item.effectiveStatus === 'matured' || item.effectiveStatus === 'rolled_over';
            return (
              <div key={item.id}>
                <div
                  className={`trace-item ${isCurrent ? 'is-current' : ''} ${
                    isInactive ? 'is-inactive' : ''
                  }`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong>
                      #{idx + 1} {item.bankName}
                    </strong>
                    <span className="badge badge-inactive">
                      {item.effectiveStatus === 'rolled_over'
                        ? '積替済'
                        : item.effectiveStatus === 'matured'
                          ? '満期終了'
                          : item.effectiveStatus === 'maturing_soon'
                            ? `まもなく満期（あと${item.daysUntilMaturity}日）`
                            : '運用中'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.88rem' }}>
                    満期日: <strong>{formatDateWithWareki(item.maturityDate)}</strong> ／ 期間:{' '}
                    {item.termYears}年 ／ 金利: <strong>{item.totalRate.toFixed(2)}%</strong> ／
                    金額: <strong>{item.amount.toLocaleString('ja-JP')} 円</strong>
                  </div>
                  {(item.campaignNote || item.maturityInterest !== null) && (
                    <div className="sub-text">
                      {item.campaignNote && `メモ: ${item.campaignNote} `}
                      {item.maturityInterest !== null &&
                        `受取利息: ${item.maturityInterest.toLocaleString('ja-JP')} 円`}
                    </div>
                  )}
                </div>
                {idx < chain.length - 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0', color: '#64748b' }}>
                    <ArrowDown size={16} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
