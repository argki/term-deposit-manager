# 定期預金マネージャー アーキテクチャ設計書

## 1. 技術スタック

| レイヤー | 採用技術 | 選定理由 |
| :--- | :--- | :--- |
| **言語** | TypeScript (strict) | 静的型付けにより AI 親和性・保守性・リファクタリング耐性が高い |
| **フロントエンド** | React + Vite | エコシステムが最大級で長期保守・情報収集が容易 |
| **グラフ描画** | Recharts | React コンポーネントとして棒グラフを宣言的に構築可能 |
| **ローカル API** | Hono (`@hono/node-server`) | 軽量・高速・TypeScript ファースト。API とビルド済み静的ファイル配信を 1 プロセスで完結可能 |
| **データ永続化** | ローカル JSON ファイル (`/app/data/deposits.json`) | ネイティブバイナリ依存がなく、Win/Mac Docker 環境で確実に動作しバックアップも容易 |
| **テスト / 品質** | Vitest + ESLint + Prettier + `tsc` | 高速な単体テストと厳格な静的解析をコンテナ内で完結 |
| **コンテナ** | Docker / Docker Compose (`node:26-alpine`) | ホスト OS に Node.js や依存パッケージをインストールせず環境を清潔に保つ |

---

## 2. ディレクトリ構成

```text
.
├── .agents/skills/          # 開発用エージェントスキル
├── .github/
│   ├── dependabot.yml       # 依存パッケージ・Docker イメージ自動更新
│   └── workflows/ci.yml     # 型チェック・Lint・テスト・ビルド CI
├── assets/                  # アプリアイコン原本・生成物 (icon.jpg, icon.png, icon.ico)
├── data/                    # ホスト側永続データマウント領域（実データは gitignore）
├── docs/                    # 要件定義・設計・タスクリスト
├── public/                  # 静的配信アセット（manifest.webmanifest, starting.html, offline.html, sw.js, assets/）
├── scripts/                 # 更新ヘルパー・アイコン生成スクリプト
├── src/
│   ├── shared/              # フロント・バック共通の型定義・ドメインロジック（ステータス判定・集計・CSVパーサ）
│   ├── server/              # Hono ローカル API サーバー・JSON 永続化ストア・SSE
│   └── client/              # React + Vite フロントエンド UI
├── compose.yaml             # ローカル起動用 Compose 定義（127.0.0.1:3457）
├── Dockerfile               # マルチステージビルド定義
├── GEMINI.md                # 開発エージェントルール
└── package.json
```

---

## 3. セキュリティ・ネットワーク方針
- ポートバインドは `127.0.0.1:3457:3457` に限定し、LAN 内他端末からのアクセスを遮断する。
- 外部 API 通信やテレメトリ送信は一切行わない。
