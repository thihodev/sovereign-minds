#!/usr/bin/env bash
# One command to (re)deploy Sovereign Minds on this machine, in Docker:
#   ./deploy.sh        pull the new code; the running world picks it up after the current turn
#   ./deploy.sh now    same, but restart the engine at once (an unfinished turn is dropped)
# It also stops an engine started outside Docker (npm start) on the same world, so two
# engines never write one data/world.db.
set -euo pipefail
# Everything runs inside main(): bash reads the whole file before `git pull` can change it under us.
main() {
cd "$(dirname "$0")"

PORT=$(grep -E '^PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"'"'"' ' || true)
PORT=${PORT:-3000}
DB=$(grep -E '^DB_PATH=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"'"'"' ' || true)
LOCK="${DB:-data/world.db}.lock"

echo "→ Lấy code mới"
git pull --ff-only

# An engine outside Docker holding this world? Stop it (its supervisor first, so it is not restarted).
if [ -f "$LOCK" ]; then
  pid=$(node -e 'try { const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (!o.docker && Date.now() - o.beat < 30000) console.log(o.pid) } catch {}' "$LOCK" 2>/dev/null || true)
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    parent=$(ps -o ppid= -p "$pid" | tr -d ' ')
    echo "→ Dừng engine đang chạy ngoài Docker (pid $pid)"
    if ps -o command= -p "$parent" 2>/dev/null | grep -q "supervisor.ts"; then kill -INT "$parent"; else kill -INT "$pid"; fi
    for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  fi
fi

echo "→ Khởi động bằng Docker"
docker compose up -d --build
if [ "${1:-}" = "now" ]; then
  echo "→ Khởi động lại engine ngay"
  docker compose restart sovereign-minds
fi

echo "→ Chờ server trả lời ở cổng $PORT"
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for i in $(seq 1 90); do
  if curl -fs "http://localhost:$PORT/api/state" >/dev/null 2>&1; then
    echo; docker compose logs --tail 12 sovereign-minds
    echo "✓ Xong: http://localhost:$PORT"
    exit 0
  fi
  # Say why it is slow instead of waiting in silence
  if [ $((i % 5)) -eq 0 ]; then
    problems=$(docker compose logs --since "$since" sovereign-minds 2>/dev/null | grep -E "đang được|bị hỏng|malformed|Error|lỗi|Engine dừng" | tail -4 || true)
    if [ -n "$problems" ]; then echo; echo "$problems"; since=$(date -u +%Y-%m-%dT%H:%M:%SZ); else printf "."; fi
  fi
  sleep 1
done
docker compose logs --tail 40 sovereign-minds
echo "✗ Server chưa trả lời sau 90 giây; xem log ở trên (docker compose logs -f sovereign-minds)." >&2
exit 1
}
main "$@"
