#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "[定期預金マネージャー] コンテナを停止しています..."
docker compose down
echo "[定期預金マネージャー] 停止しました。"
