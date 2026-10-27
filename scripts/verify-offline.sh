#!/bin/bash
set -euo pipefail

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

IMAGES=("python:3.11-slim" "gcc:13" "alpine/java:22-jdk")
BASE_URL="http://localhost:5173"
MAX_WAIT=60

echo "=== DevPrep Offline Verification ==="
echo ""

# 1. Check Docker
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running."
  exit 1
fi
echo "Docker daemon: OK"

# 2. Check images
for img in "${IMAGES[@]}"; do
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "ERROR: Image $img not found. Run scripts/prepare-offline.sh first."
    exit 1
  fi
done
echo "Required images: OK"

# 3. Note on network isolation
echo "Network isolation: containers use NetworkMode:'none' (enforced in src/lib/server/containerConfig.ts)"
echo ""

# 4. Start dev server
echo "Starting dev server ..."
npm run dev > /dev/null 2>&1 &
SERVER_PID=$!

# 5. Wait for server
echo -n "Waiting for server at $BASE_URL "
ELAPSED=0
while ! curl -s -o /dev/null -w '' "$BASE_URL" 2>/dev/null; do
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  echo -n "."
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo ""
    echo "ERROR: Server did not start within ${MAX_WAIT}s."
    exit 1
  fi
done
echo " ready (${ELAPSED}s)"
echo ""

# 6. Run tests (two-sum in all 3 languages)
echo "Running judge verification: two-sum (python, cpp, java) ..."
echo ""
if node scripts/verify-judge.mjs --problem two-sum; then
  echo ""
  echo "=== PASS: Offline verification succeeded ==="
else
  echo ""
  echo "=== FAIL: Judge verification failed ==="
  exit 1
fi
