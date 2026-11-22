#!/usr/bin/env sh
set -eu

ACTION="${1:-}"
PENDING_FILE="${2:-data/.update-pending}"
THIRTY_DAYS_SEC=$((30 * 86400))

is_git_clean_main() {
  [ -d .git ] || return 1
  command -v git >/dev/null 2>&1 || return 1
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [ "$BRANCH" = "main" ] || return 1
  DIRTY="$(git status --porcelain 2>/dev/null || true)"
  [ -z "$DIRTY" ] || return 1
  return 0
}

is_image_older_than_30_days() {
  command -v docker >/dev/null 2>&1 || return 1
  IMG_ID="$(docker compose images -q deposit-app 2>/dev/null || true)"
  [ -n "$IMG_ID" ] || return 1
  IMG_CREATED="$(docker image inspect --format '{{.Created}}' "$IMG_ID" 2>/dev/null || true)"
  [ -n "$IMG_CREATED" ] || return 1

  if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import datetime, sys
s = sys.argv[1].replace('Z', '+00:00')
dt = datetime.datetime.fromisoformat(s)
age = (datetime.datetime.now(datetime.timezone.utc) - dt.astimezone(datetime.timezone.utc)).total_seconds()
sys.exit(0 if age >= 30 * 86400 else 1)
" "$IMG_CREATED" 2>/dev/null
    return $?
  fi

  CREATED_EPOCH="$(date -d "$IMG_CREATED" +%s 2>/dev/null || true)"
  if [ -n "$CREATED_EPOCH" ]; then
    NOW_EPOCH="$(date +%s)"
    [ $((NOW_EPOCH - CREATED_EPOCH)) -ge "$THIRTY_DAYS_SEC" ]
    return $?
  fi

  return 1
}

do_pull() {
  if ! [ -d .git ] || ! command -v git >/dev/null 2>&1; then
    return 0
  fi

  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [ "$BRANCH" != "main" ]; then
    echo "[Term Deposit Manager] Skipping git pull (current branch is '$BRANCH', not 'main')."
    return 0
  fi

  DIRTY="$(git status --porcelain 2>/dev/null || true)"
  if [ -n "$DIRTY" ]; then
    echo "[Term Deposit Manager] Skipping git pull (working tree has uncommitted changes)."
    return 0
  fi

  echo "[Term Deposit Manager] Pulling latest changes from origin/main..."
  if ! GIT_SSH_COMMAND="ssh -o ConnectTimeout=5 -o BatchMode=yes" git pull --ff-only origin main; then
    echo "[Term Deposit Manager] Warning: git pull failed or could not fast-forward. Continuing with local source."
  fi
  return 0
}

do_check() {
  REASONS=""

  if is_image_older_than_30_days; then
    REASONS="age"
  fi

  if is_git_clean_main; then
    if GIT_SSH_COMMAND="ssh -o ConnectTimeout=5 -o BatchMode=yes" git fetch origin main >/dev/null 2>&1; then
      AHEAD="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
      if [ "${AHEAD:-0}" -gt 0 ] 2>/dev/null; then
        if [ -n "$REASONS" ]; then
          REASONS="${REASONS},git"
        else
          REASONS="git"
        fi
      fi
    else
      echo "[Term Deposit Manager] Note: Could not reach origin/main for update check (offline or SSH unavailable)."
    fi
  fi

  if [ -n "$REASONS" ]; then
    mkdir -p "$(dirname "$PENDING_FILE")"
    printf '%s\n' "$REASONS" > "$PENDING_FILE"
    echo "[Term Deposit Manager] Update available ($REASONS). Scheduled for next startup."
  fi
  return 0
}

case "$ACTION" in
  pull)
    do_pull
    ;;
  check)
    do_check
    ;;
  *)
    echo "Usage: $0 {pull|check} [pending-file]" >&2
    exit 1
    ;;
esac
