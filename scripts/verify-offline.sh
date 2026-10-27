#!/bin/bash
set -euo pipefail

# Offline Readiness Smoke Test
#
# Verifies that the prerequisites for offline operation are met:
# 1. Docker is running and required images are cached locally.
# 2. The dev server starts and the judge executes code successfully.
# 3. Execution containers use NetworkMode:'none' (enforced in containerConfig.ts).
#
# LIMITATION: This script does NOT disable the host network. It confirms that
# the required images and judge functionality are available, but cannot prove
# that the application works with the host fully disconnected from the internet.
# For a true offline test, manually disable Wi-Fi / unplug Ethernet, then run
# this script. See ARCHITECTURE.md for the full offline deployment procedure.

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

echo "=== Offline Readiness Smoke Test ==="
echo ""
echo "NOTE: This verifies prerequisites for offline use. It does not"
echo "      disable host networking. For a true offline test, disconnect"
echo "      from the internet before running."
echo ""

# 1. Check Docker
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running."
  exit 1
fi
echo "Docker daemon: OK"

# 2. Check images are cached locally
MISSING=0
for img in "${IMAGES[@]}"; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    SIZE=$(docker image inspect "$img" --format '{{.Size}}' | awk '{printf "%.0f MB", $1/1024/1024}')
    echo "  $img: cached ($SIZE)"
  else
    echo "  $img: MISSING"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo "ERROR: Missing images. Run scripts/prepare-offline.sh first."
  exit 1
fi
echo "Required images: OK"

# 3. Note container security
echo ""
echo "Container network isolation: execution containers use NetworkMode:'none'"
echo "  (enforced in src/lib/server/containerConfig.ts, verified by security tests)"

# 4. Start dev server
echo ""
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

# 6. Run judge tests (two-sum in all 3 languages)
echo "Running judge smoke test: two-sum (python, cpp, java) ..."
echo ""
if node scripts/verify-judge.mjs --problem two-sum; then
  echo ""
  echo "=== PASS: Offline readiness confirmed ==="
  echo ""
  echo "All prerequisites met: Docker images cached, judge functional."
  echo "Execution containers enforce NetworkMode:'none' (no external access)."
  echo "For full offline verification, repeat this test with host network disabled."
else
  echo ""
  echo "=== FAIL: Judge smoke test failed ==="
  exit 1
fi
