export type DepositStatus = 'active' | 'maturing_soon' | 'matured' | 'rolled_over';

export type StoredDepositStatus = 'active' | 'matured' | 'rolled_over';

export interface DepositRecord {
  id: string;
  bankName: string;
  /** YYYY-MM-DD (任意) */
  startDate: string | null;
  /** YYYY-MM-DD */
  maturityDate: string;
  /** 預入期間（年、例: 0.4, 0.5, 1, 3, 5, 7） */
  termYears: number;
  /** 基本金利（%、例: 1.0） */
  baseRate: number;
  /** キャンペーン上乗せ金利（%、例: 0.25） */
  campaignRate: number;
  /** 合計適用金利（%） */
  totalRate: number;
  /** キャンペーン名・メモ（例: "◎+0.25", "特別金利"） */
  campaignNote: string;
  /** 預入金額（円） */
  amount: number;
  /** 満期利息・受取額（円、任意） */
  maturityInterest: number | null;
  /** 永続化上のステータス（maturing_soon は日付から動的判定） */
  status: StoredDepositStatus;
  /** 積替元の預金 ID */
  parentDepositId: string | null;
  /** 積替先の預金 ID */
  rolledOverToId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DepositWithComputed extends DepositRecord {
  /** 表示上の実効ステータス（active のうち期限接近は maturing_soon） */
  effectiveStatus: DepositStatus;
  /** 基準日からの残り日数（満期済みは負数） */
  daysUntilMaturity: number;
  /** 残存期間（年換算） */
  remainingYears: number;
  /** 積替検討候補かどうか */
  isRolloverCandidate: boolean;
}

export interface AppSettings {
  /** まもなく満期と判定する残日数しきい値（デフォルト: 90日） */
  maturingSoonDays: number;
  /** 積替検討候補と判定する最小残存期間（年、デフォルト: 1.0年） */
  rolloverCandidateMinYears: number;
  /** 積替検討候補と判定する最大金利（%未満、デフォルト: 1.0%） */
  rolloverCandidateMaxRate: number;
}

export interface DepositStore {
  version: 1;
  deposits: DepositRecord[];
  settings: AppSettings;
  updatedAt: string;
}

export interface BankSummary {
  bankName: string;
  activeCount: number;
  maturingSoonCount: number;
  inactiveCount: number;
  totalActiveAmount: number;
  weightedAverageRate: number;
}

export interface PortfolioSummary {
  totalActiveAmount: number;
  activeCount: number;
  weightedAverageRate: number;
  maturingSoonCount: number;
  maturingSoonAmount: number;
  rolloverCandidateCount: number;
  rolloverCandidateAmount: number;
  inactiveCount: number;
  byBank: BankSummary[];
}

export interface RolloverRequest {
  bankName: string;
  startDate: string | null;
  maturityDate: string;
  termYears: number;
  baseRate: number;
  campaignRate: number;
  campaignNote: string;
  amount: number;
  /** 積替元預金に記録する受取利息（任意） */
  settledInterest: number | null;
}

export interface CsvImportRowPreview {
  bankName: string;
  source: DepositRecord;
  rolledOverTarget: DepositRecord | null;
}

export interface CsvImportPreview {
  records: DepositRecord[];
  bankTotals: Record<string, number>;
  grandTotal: number;
  activeCount: number;
  maturedCount: number;
  rolledOverCount: number;
  warnings: string[];
}
