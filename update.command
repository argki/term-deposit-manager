#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

STARTING_FILE="$(pwd)/public/starting.html"
OPENED_STARTING=false
if [ -f "$STARTING_FILE" ]; then
  echo "[定期預金マネージャー] アップデート中画面をブラウザで開きます..."
  open "file://${STARTING_FILE}?mode=update"
  OPENED_STARTING=true
fi

echo "[定期預金マネージャー] Docker の起動状態を確認しています..."
if ! docker info >/dev/null 2>&1; then
  echo "[エラー] Docker Desktop が起動していません。Docker Desktop を起動してから再実行してください。"
  read -r -p "Enter キーを押して閉じます..."
  exit 1
fi

echo "[定期預金マネージャー] Git リポジトリの更新を確認しています..."
sh "$(pwd)/scripts/update-helper.sh" pull

echo "[定期預金マネージャー] コンテナを再ビルドして更新しています..."
docker compose up -d --build --force-recreate

echo "[定期預金マネージャー] アプリの起動を待機しています..."
for i in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:3457/api/health" >/dev/null 2>&1; then
    rm -f "$(pwd)/data/.update-pending"
    if [ "$OPENED_STARTING" = true ]; then
      echo "[定期預金マネージャー] 更新完了。アプリの準備が整いました (http://127.0.0.1:3457)"
    else
      echo "[定期預金マネージャー] 更新完了。ブラウザを開きます (http://127.0.0.1:3457)"
      open "http://127.0.0.1:3457"
    fi
    exit 0
  fi
  sleep 1
done

echo "[エラー] アプリの起動確認がタイムアウトしました。docker compose logs を確認してください。"
read -r -p "Enter キーを押して閉じます..."
exit 1
