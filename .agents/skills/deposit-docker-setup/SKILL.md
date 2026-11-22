---
name: deposit-docker-setup
description: >-
  Use this skill when setting up, modifying, or verifying the Docker / Docker Compose
  container environment, host volume mounts for local data persistence, localhost-only
  port binding (3457), Windows/macOS double-click launcher scripts, or app icons (png/ico).
---

# Deposit Docker, Launcher & Icon Setup

ホスト環境を汚さず、Windows / macOS の双方でダブルクリック起動できるコンテナ環境およびアプリアイコンを構築・検証するための手順。

## 1. コンテナ構成要件

1. **環境非汚染**: Node.js・`pnpm`・アプリ依存はすべてコンテナ内に閉じ込める。
2. **セキュリティ（localhost 限定）**:
   - `compose.yaml` のポートマッピングは必ず `127.0.0.1:3457:3457` とし、`0.0.0.0` で公開しない。
3. **データ永続化**:
   - `./data:/app/data` をバインドマウントし、`/app/data/deposits.json` に保存する。
   - `.gitignore` で `data/*`（`!data/.gitkeep`）を除外し、実データをコミットしない。

## 2. ダブルクリック起動・停止・更新スクリプト

- **Windows**: `start.bat` / `stop.bat` / `update.bat`
  - 起動直後に `public/starting.html`（更新時は `?mode=update`）を最大化表示で開く。
  - `http://127.0.0.1:3457/api/health` 応答待機後にアプリ本体へ遷移する。
- **macOS**: `start.command` / `stop.command` / `update.command`
  - `chmod +x` により実行権限を付与して使用する。

## 3. アプリアイコン（PNG / ICO）生成要件

- `assets/icon.png`（256×256）および `assets/icon.ico`（16, 32, 48, 64, 128, 256 マルチサイズ）を `assets/` と `public/assets/` の両方に配置する。
- 変換が必要な場合は `scripts/generate-icons.py` をコンテナ内で実行する（ホストへ Python/Pillow を直接インストールしない）：
  ```bash
  docker run --rm -v "$(pwd):/app" -w /app python:3-alpine sh -c "pip install --no-cache-dir pillow && python3 scripts/generate-icons.py"
  ```
