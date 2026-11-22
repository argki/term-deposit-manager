import { ChevronDown, ChevronUp, Coins, Percent } from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MaturityYearBucket } from '../../shared/deposits.js';
import type { PortfolioSummary } from '../../shared/types.js';
import { formatYearWithWareki } from '../../shared/wareki.js';

interface SummaryDashboardProps {
  summary: PortfolioSummary;
  maturityBuckets: MaturityYearBucket[];
  onSelectFilter: (filter: 'all' | 'maturing_soon' | 'rollover_candidate') => void;
  onSelectBank: (bankName: string) => void;
}

function formatYen(value: number): string {
  return `${value.toLocaleString('ja-JP')} 円`;
}

function formatManYen(value: number): string {
  return `${Math.round(value / 10_000).toLocaleString('ja-JP')}万円`;
}

export function SummaryDashboard({
  summary,
  maturityBuckets,
  onSelectFilter,
  onSelectBank,
}: SummaryDashboardProps) {
  const [expanded, setExpanded] = useState(false);

  const bankChartData = summary.byBank
    .filter((b) => b.totalActiveAmount > 0)
    .sort((a, b) => b.totalActiveAmount - a.totalActiveAmount);

  return (
    <section className="collapsible-card" aria-label="ポートフォリオ概要">
      <div className="collapsible-toggle-row">
        <div className="summary-compact-info">
          <span className="summary-compact-pill">
            <Coins size={14} />
            運用中: {formatYen(summary.totalActiveAmount)}（{summary.activeCount}件）
          </span>
          <span className="summary-compact-pill">
            <Percent size={14} />
            平均金利: {summary.weightedAverageRate.toFixed(2)}%
          </span>
        </div>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {expanded ? 'サマリー・グラフを折りたたむ' : 'サマリー・グラフを表示'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          <div className="kpi-grid">
            <div
              className="kpi-card clickable"
              onClick={() => onSelectFilter('all')}
              title="クリックして運用中一覧を表示"
            >
              <div className="kpi-label">
                <span>運用中残高合計</span>
                <Coins size={16} />
              </div>
              <div className="kpi-value">{formatYen(summary.totalActiveAmount)}</div>
              <div className="kpi-sub">
                運用中 {summary.activeCount} 件（終了・積替済 {summary.inactiveCount} 件）
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-label">
                <span>加重平均金利</span>
                <Percent size={16} />
              </div>
              <div className="kpi-value">{summary.weightedAverageRate.toFixed(2)}%</div>
              <div className="kpi-sub">運用中残高に対する加重平均</div>
            </div>
          </div>

          {summary.activeCount > 0 && (
            <div className="charts-grid">
              <div className="chart-box">
                <h3>銀行別 運用中残高（バーをクリックで絞り込み）</h3>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={bankChartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="bankName" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={formatManYen} tick={{ fontSize: 11 }} width={64} />
                      <Tooltip
                        formatter={(val) => [formatYen(Number(val ?? 0)), '運用中残高']}
                      />
                      <Bar
                        dataKey="totalActiveAmount"
                        fill="#0f766e"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(entry) => {
                          const data = entry as unknown as {
                            bankName?: string;
                            payload?: { bankName?: string };
                          };
                          const name = data?.payload?.bankName ?? data?.bankName;
                          if (name) onSelectBank(name);
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-box">
                <h3>満期年別 到来予定額</h3>
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={maturityBuckets} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="year"
                        tickFormatter={(y) => formatYearWithWareki(String(y))}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tickFormatter={formatManYen} tick={{ fontSize: 11 }} width={64} />
                      <Tooltip
                        labelFormatter={(y) => formatYearWithWareki(String(y))}
                        formatter={(val) => [formatYen(Number(val ?? 0)), '満期予定額']}
                      />
                      <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
