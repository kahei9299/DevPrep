#!/bin/bash
set -euo pipefail

IMAGES=("python:3.11-slim" "gcc:13" "alpine/java:22-jdk")

echo "=== DevPrep Offline Preparation ==="
echo ""

# Check Docker
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop and retry."
  exit 1
fi
echo "Docker daemon: OK"
echo ""

# Pull images
FAILED=0
for img in "${IMAGES[@]}"; do
  echo "Pulling $img ..."
  if docker pull "$img"; then
    echo "  OK"
  else
    echo "  FAILED to pull $img"
    FAILED=1
  fi
done
echo ""

# Verify and summarize
echo "=== Image Summary ==="
printf "%-30s %-12s %s\n" "IMAGE" "SIZE" "STATUS"
for img in "${IMAGES[@]}"; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    SIZE=$(docker image inspect "$img" --format '{{.Size}}' | awk '{printf "%.0f MB", $1/1024/1024}')
    printf "%-30s %-12s %s\n" "$img" "$SIZE" "READY"
  else
    printf "%-30s %-12s %s\n" "$img" "-" "MISSING"
    FAILED=1
  fi
done
echo ""

if [ "$FAILED" -ne 0 ]; then
  echo "ERROR: Some images are missing. Offline operation will not work."
  exit 1
fi

echo "All images ready for offline use."
