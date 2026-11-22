#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PENDING_FILE="$(pwd)/data/.update-pending"
UPDATE_NEEDED=false
if [ -f "$PENDING_FILE" ]; then
  UPDATE_NEEDED=true
fi

STARTING_FILE="$(pwd)/public/starting.html"
OPENED_STARTING=false
if [ -f "$STARTING_FILE" ]; then
  if [ "$UPDATE_NEEDED" = true ]; then
    echo "[定期預金マネージャー] 予約されたアップデートを実行するため、アップデート中画面をブラウザで開きます..."
    open "file://${STARTING_FILE}?mode=update"
  else
    echo "[定期預金マネージャー] 起動中画面をブラウザで開きます..."
    open "file://${STARTING_FILE}"
  fi
  OPENED_STARTING=true
fi

echo "[定期預金マネージャー] Docker の起動状態を確認しています..."
if ! docker info >/dev/null 2>&1; then
  echo "[エラー] Docker Desktop が起動していません。Docker Desktop を起動してから再実行してください。"
  read -r -p "Enter キーを押して閉じます..."
  exit 1
fi

if [ "$UPDATE_NEEDED" = true ]; then
  echo "[定期預金マネージャー] 予約されたアップデートを実行しています（Git 更新確認・コンテナ再ビルド）..."
  sh "$(pwd)/scripts/update-helper.sh" pull
  docker compose up -d --build --force-recreate
  MAX_WAIT=180
else
  echo "[定期預金マネージャー] コンテナを起動しています..."
  docker compose up -d
  MAX_WAIT=30
fi

echo "[定期預金マネージャー] アプリの起動を待機しています..."
for i in $(seq 1 "$MAX_WAIT"); do
  if curl -sf "http://127.0.0.1:3457/api/health" >/dev/null 2>&1; then
    if [ "$OPENED_STARTING" = true ]; then
      echo "[定期預金マネージャー] アプリの起動が完了しました (http://127.0.0.1:3457)"
    else
      echo "[定期預金マネージャー] ブラウザを開きます (http://127.0.0.1:3457)"
      open "http://127.0.0.1:3457"
    fi
    if [ "$UPDATE_NEEDED" = true ]; then
      rm -f "$PENDING_FILE"
    else
      echo "[定期預金マネージャー] 次回起動向けのアップデート有無を確認しています..."
      sh "$(pwd)/scripts/update-helper.sh" check "$PENDING_FILE"
    fi
    exit 0
  fi
  sleep 1
done

echo "[エラー] アプリの起動確認がタイムアウトしました。docker compose logs を確認してください。"
read -r -p "Enter キーを押して閉じます..."
exit 1
