---
name: deposit-quality-deps
description: >-
  Use this skill when running type checks, linting, formatting, or unit tests inside
  the container, or when setting up and verifying automated dependency updates
  (Renovate / Dependabot) and GitHub Actions CI to keep all modules up to date.
---

# Quality Checks & Dependency Freshness

依存モジュールを常に最新に保ちつつ、AI・人間双方にとって安全に保守できる品質ゲートを運用するための手順。

## 1. 品質チェック構成

すべてのチェックはホスト環境を汚さず、Docker コンテナ内で完結して実行できるコマンドとして `package.json` の `scripts` に定義する。

- **型チェック**: `pnpm run typecheck` (`tsc --noEmit`)
- **Lint / Format**: `pnpm run lint` (`eslint .`) / `pnpm run format:check` (`prettier --check .`)
- **単体テスト**: `pnpm run test` (`vitest run`)
- **本番ビルド**: `pnpm run build`

## 2. 依存関係最新化の仕組み

1. **最新安定バージョンの事前確認**:
   - `Dockerfile` のベースイメージ（Node.js Active LTS 等）、`.github/workflows/` の GitHub Actions、`package.json` の `packageManager` や依存パッケージを追加・更新する際は、必ず最新の安定版・推奨バージョンを公式リリース情報や Web 検索で確認し、古いバージョンが固定されたままにならないようにする。
   - Node.js メジャーアップデートに伴う非互換（例: Node 25/26 以降での `corepack` 同梱廃止など）や、`pnpm-lock.yaml` との整合性（`--frozen-lockfile` でエラーにならないか）も同時に確認する。
2. **パッケージマネージャ**: `pnpm` を使用し、ロックファイル（`pnpm-lock.yaml`）でバージョンを厳密に管理する。
3. **自動アップデート設定**:
   - `.github/dependabot.yml` により npm 依存関係・Docker ベースイメージ・GitHub Actions の定期アップデート PR が自動生成されるようにする。
   - `.github/workflows/dependabot-auto-merge.yml`（`dependabot/fetch-metadata@v3` 使用）と GitHub Rulesets（`.github/rulesets/main-branch-protection.json`）を組み合わせ、CI（`verify` ジョブ）通過後にパッチ・マイナー更新の Dependabot PR が自動マージされるようにする。
4. **CI 検証（GitHub Actions）**:
   - `.github/workflows/ci.yml` により PR / push 時に「型チェック → Lint → 単体テスト → ビルド」を自動実行し、破壊的変更を即検知できるようにする。

## 3. 検証手順

変更を加えた際は、コンテナ内で以下を順に実行し、すべてエラー 0 で完了することを確認する（エージェント環境で `docker` が実行できない場合は、ユーザーへコンテナ内実行コマンドを案内する）。

1. 型チェックコマンドの実行（`pnpm run typecheck`）
2. Lint チェックコマンドの実行（`pnpm run lint`）
3. 単体テストコマンドの実行（`pnpm run test`）
4. 本番ビルドコマンドの実行（`pnpm run build`）
