import {
  CheckCircle2,
  Edit3,
  GitBranch,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Fragment } from 'react';
import { calculateEstimatedInterest } from '../../shared/deposits.js';
import type { BankSummary, DepositWithComputed } from '../../shared/types.js';
import { formatDateWithWareki } from '../../shared/wareki.js';

interface DepositTableProps {
  deposits: DepositWithComputed[];
  viewMode: 'flat' | 'grouped';
  bankSummaries: BankSummary[];
  onEdit: (deposit: DepositWithComputed) => void;
  onRollover: (deposit: DepositWithComputed) => void;
  onMature: (deposit: DepositWithComputed) => void;
  onDelete: (deposit: DepositWithComputed) => void;
  onShowTrace: (deposit: DepositWithComputed) => void;
}

function renderStatusBadge(dep: DepositWithComputed) {
  switch (dep.effectiveStatus) {
    case 'maturing_soon': {
      const label =
        dep.daysUntilMaturity < 0
          ? `満期超過 (${Math.abs(dep.daysUntilMaturity)}日)`
          : dep.daysUntilMaturity === 0
            ? '本日満期'
            : `あと ${dep.daysUntilMaturity} 日`;
      return <span className="badge badge-soon">{label}</span>;
    }
    case 'active':
      return <span className="badge badge-active">運用中</span>;
    case 'rolled_over':
      return <span className="badge badge-inactive">積替済（無効）</span>;
    case 'matured':
      return <span className="badge badge-inactive">満期終了（無効）</span>;
  }
}

export function DepositTable({
  deposits,
  viewMode,
  bankSummaries,
  onEdit,
  onRollover,
  onMature,
  onDelete,
  onShowTrace,
}: DepositTableProps) {
  if (deposits.length === 0) {
    return (
      <div className="table-card">
        <div className="empty-state">
          <p>表示できる定期預金データがありません。</p>
          <p className="sub-text">
            一覧上部の「新規登録」または下部「データ移行・設定」から定期預金を登録してください。
          </p>
        </div>
      </div>
    );
  }

  const bankSummaryMap = new Map(bankSummaries.map((b) => [b.bankName, b]));

  const renderActions = (dep: DepositWithComputed, isInactive: boolean) => {
    const hasTrace = dep.parentDepositId !== null || dep.rolledOverToId !== null;
    return (
      <div className="row-actions">
        {hasTrace && (
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => onShowTrace(dep)}
            title="積替トレース履歴を表示"
          >
            <GitBranch size={14} />
            履歴
          </button>
        )}
        {!isInactive && (
          <>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => onRollover(dep)}
              title="この預金を積み替える"
            >
              <RefreshCw size={14} />
              積替
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => onMature(dep)}
              title="満期終了にする"
            >
              <CheckCircle2 size={14} />
              満期
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => onEdit(dep)}
          title="編集"
        >
          <Edit3 size={14} />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-danger"
          onClick={() => onDelete(dep)}
          title="削除"
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

  const renderRow = (dep: DepositWithComputed) => {
    const isInactive = dep.effectiveStatus === 'matured' || dep.effectiveStatus === 'rolled_over';
    const rowClass =
      dep.effectiveStatus === 'maturing_soon'
        ? 'row-maturing-soon'
        : isInactive
          ? 'row-inactive'
          : '';
    const estimated = calculateEstimatedInterest(dep.amount, dep.totalRate, dep.termYears);

    return (
      <tr key={dep.id} className={rowClass}>
        <td className="nowrap">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            {renderStatusBadge(dep)}
            {dep.isRolloverCandidate && (
              <span className="badge badge-candidate">積替検討候補</span>
            )}
          </div>
        </td>
        <td className="nowrap">
          <strong>{dep.bankName}</strong>
        </td>
        <td className="nowrap">
          <span className={isInactive ? 'muted-strike' : ''}>
            {formatDateWithWareki(dep.maturityDate)}
          </span>
          {dep.startDate && (
            <span className="sub-text">預入: {formatDateWithWareki(dep.startDate)}</span>
          )}
          {!isInactive && (
            <span className="sub-text">残存約 {dep.remainingYears.toFixed(1)} 年</span>
          )}
        </td>
        <td className="num nowrap">{dep.termYears > 0 ? `${dep.termYears} 年` : '-'}</td>
        <td className="num nowrap">
          <strong>{dep.totalRate.toFixed(2)}%</strong>
          {dep.campaignRate > 0 && (
            <span className="sub-text">
              ({dep.baseRate.toFixed(2)}% + {dep.campaignRate.toFixed(2)}%)
            </span>
          )}
        </td>
        <td className="num nowrap">
          <strong className={isInactive ? 'muted-strike' : ''}>
            {dep.amount > 0 ? `${dep.amount.toLocaleString('ja-JP')} 円` : '-'}
          </strong>
        </td>
        <td className="num nowrap">
          {dep.maturityInterest !== null ? (
            <>
              <span>{dep.maturityInterest.toLocaleString('ja-JP')} 円</span>
              <span className="sub-text">記録値</span>
            </>
          ) : !isInactive && estimated.net > 0 ? (
            <>
              <span>約 {estimated.net.toLocaleString('ja-JP')} 円</span>
              <span className="sub-text">税引後目安</span>
            </>
          ) : (
            '-'
          )}
        </td>
        <td>
          <span>{dep.campaignNote || '-'}</span>
        </td>
        <td className="nowrap">{renderActions(dep, isInactive)}</td>
      </tr>
    );
  };

  const renderCard = (dep: DepositWithComputed) => {
    const isInactive = dep.effectiveStatus === 'matured' || dep.effectiveStatus === 'rolled_over';
    const cardClass =
      dep.effectiveStatus === 'maturing_soon'
        ? 'deposit-card row-maturing-soon'
        : isInactive
          ? 'deposit-card row-inactive'
          : 'deposit-card';
    const estimated = calculateEstimatedInterest(dep.amount, dep.totalRate, dep.termYears);

    return (
      <div key={dep.id} className={cardClass}>
        <div className="deposit-card-top">
          <div className="deposit-card-title">
            <strong>{dep.bankName}</strong>
            {renderStatusBadge(dep)}
            {dep.isRolloverCandidate && (
              <span className="badge badge-candidate">積替検討候補</span>
            )}
          </div>
          <div className="deposit-card-amount">
            <span className={isInactive ? 'muted-strike' : ''}>
              {dep.amount > 0 ? `${dep.amount.toLocaleString('ja-JP')} 円` : '-'}
            </span>
            {' ／ '}
            <span>{dep.totalRate.toFixed(2)}%</span>
          </div>
        </div>

        <div className="deposit-card-meta">
          <span>
            満期: <strong>{formatDateWithWareki(dep.maturityDate)}</strong>
            {!isInactive && ` (残存約 ${dep.remainingYears.toFixed(1)}年)`}
          </span>
          <span>期間: {dep.termYears > 0 ? `${dep.termYears}年` : '-'}</span>
          {dep.maturityInterest !== null ? (
            <span>利息記録: {dep.maturityInterest.toLocaleString('ja-JP')} 円</span>
          ) : (
            !isInactive &&
            estimated.net > 0 && (
              <span>税引後目安: 約 {estimated.net.toLocaleString('ja-JP')} 円</span>
            )
          )}
          {dep.campaignNote && <span>メモ: {dep.campaignNote}</span>}
        </div>

        <div className="deposit-card-bottom">
          <span className="sub-text" style={{ marginTop: 0 }}>
            {dep.startDate ? `預入: ${dep.startDate.replace(/-/g, '/')}` : ''}
          </span>
          {renderActions(dep, isInactive)}
        </div>
      </div>
    );
  };

  let desktopBody: React.ReactNode;
  let narrowBody: React.ReactNode;

  if (viewMode === 'grouped') {
    const groups = new Map<string, DepositWithComputed[]>();
    for (const dep of deposits) {
      const list = groups.get(dep.bankName) ?? [];
      list.push(dep);
      groups.set(dep.bankName, list);
    }
    desktopBody = Array.from(groups.entries()).map(([bankName, list]) => {
      const bSummary = bankSummaryMap.get(bankName);
      return (
        <Fragment key={bankName}>
          <tr className="bank-group-header">
            <td colSpan={9}>
              {bankName} — 運用中残高:{' '}
              {(bSummary?.totalActiveAmount ?? 0).toLocaleString('ja-JP')} 円（
              {bSummary?.activeCount ?? 0} 件 / 平均金利{' '}
              {(bSummary?.weightedAverageRate ?? 0).toFixed(2)}%）
            </td>
          </tr>
          {list.map(renderRow)}
        </Fragment>
      );
    });
    narrowBody = Array.from(groups.entries()).map(([bankName, list]) => {
      const bSummary = bankSummaryMap.get(bankName);
      return (
        <Fragment key={bankName}>
          <div
            style={{
              background: '#e2e8f0',
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            {bankName} — 運用中残高:{' '}
            {(bSummary?.totalActiveAmount ?? 0).toLocaleString('ja-JP')} 円（
            {bSummary?.activeCount ?? 0} 件 / 平均{' '}
            {(bSummary?.weightedAverageRate ?? 0).toFixed(2)}%）
          </div>
          {list.map(renderCard)}
        </Fragment>
      );
    });
  } else {
    desktopBody = deposits.map(renderRow);
    narrowBody = deposits.map(renderCard);
  }

  return (
    <div className="table-card">
      <div className="table-scroll table-desktop">
        <table className="deposit-table">
          <thead>
            <tr>
              <th>ステータス</th>
              <th>銀行</th>
              <th>満期日 / 預入日</th>
              <th className="num">期間</th>
              <th className="num">適用金利</th>
              <th className="num">預入金額</th>
              <th className="num">満期利息</th>
              <th>キャンペーン・メモ</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>{desktopBody}</tbody>
        </table>
      </div>
      <div className="card-list-narrow">{narrowBody}</div>
    </div>
  );
}
