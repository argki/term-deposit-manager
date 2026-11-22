---
name: deposit-domain-dev
description: >-
  Use this skill when designing or implementing core application features for the
  term deposit manager: status auto-detection, rollover tracing, rollover candidate
  metrics, narrow-window responsive UI, or Excel-exported CSV import/export.
---

# Term Deposit Domain & Feature Development

[要件定義書](../../../docs/requirements.md) に基づき、定期預金管理のコア機能と UI を実装・検証するための手順。

## 1. ドメインモデル設計指針

1. **ステータス設計**:
   - 永続ステータスは `'active' | 'matured' | 'rolled_over'`。
   - 表示用実効ステータス（`effectiveStatus`）は、`'active'` かつ満期までの残日数が `settings.maturingSoonDays` 以内の場合に `'maturing_soon'` へ自動変換する。
   - 無効状態（`matured`, `rolled_over`）は赤色を使わず、落ち着いたグレー系で表現する。
2. **積替トレース**:
   - `parentDepositId` と `rolledOverToId` の双方向リンクで積替履歴チェーンを保持する。
   - `getDepositTraceChain()` で任意のノードから親→子→孫の履歴を一貫して取得する。
3. **積替検討指標**:
   - 残存期間が `rolloverCandidateMinYears` 以上かつ適用金利が `rolloverCandidateMaxRate` 未満の運用中預金を `isRolloverCandidate` として抽出する。

## 2. UI / レイアウト指針

1. **狭幅ウィンドウ（1100px 以下）対応**:
   - `1100px` 以下では 9 列テーブルを非表示にし、折り返し崩れのないコンパクトカードリスト（`.card-list-narrow`）へ切り替える。
2. **操作導線と初期折りたたみ**:
   - 「新規登録」ボタンは一覧表の直上（ツールバー内）に配置する。
   - サマリー・グラフおよび「データ移行・設定（CSV 取込 / JSON 復元 / しきい値）」は初期状態で折りたたみとする。

## 3. CSV インポート（Excel 書き出し形式）

- A 列の銀行名引き継ぎ、小計行・全体合計行スキップ、`満期終了` 判定に対応。
- 左ブロック（列 1〜）を元預入、右ブロック（列 11〜）を積替先としてパースし、親子リンクを自動生成する（左右同一内容の行は重複警告付きで 2 件の運用中預金として取り込む）。
- 単体テストで銀行別小計および総計の一致を必ず検証する。
