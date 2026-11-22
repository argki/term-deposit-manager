# 定期預金マネージャー (Term Deposit Manager)

複数銀行の定期預金の満期管理・積替トレース・低金利預金の見直しを行うローカル Web アプリケーションです。
Docker コンテナ上で完結して動作するため、PC（Windows / macOS）本体に Node.js 等をインストールする必要はありません。

## 前提条件

- **Windows**: WSL 上で Docker / Docker Compose が利用可能で起動していること
- **macOS**: Docker Desktop がインストールされ、起動していること

## 使い方（ダブルクリック起動）

### Windows
- **起動**: `start.bat` をダブルクリック（ブラウザで `http://127.0.0.1:3457` を開きます）
- **停止**: `stop.bat` をダブルクリック
- **アップデート（再ビルド）**: コード更新後は `update.bat` をダブルクリック

### macOS
- **初回のみ実行権限を付与**:
  ```bash
  chmod +x start.command stop.command update.command scripts/update-helper.sh
  ```
- **起動**: `start.command` をダブルクリック
- **停止**: `stop.command` をダブルクリック
- **アップデート（再ビルド）**: `update.command` をダブルクリック

## データ保存とセキュリティ

- データはすべてホスト側の `./data/deposits.json` にローカル保存され、外部サーバーへ送信されません。
- ポート公開は `127.0.0.1:3457` に限定されており、LAN 内の他端末からはアクセスできません。
- 画面下部の「データ移行・バックアップ・設定」から、Excel 書き出し CSV の取り込みや JSON/CSV エクスポートが可能です。

## 開発・テスト用コマンド（コンテナ実行）

```bash
docker run --rm -v "$(pwd):/app" -w /app node:26-alpine sh -c "npm install -g corepack@latest && corepack enable && pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build"
```
