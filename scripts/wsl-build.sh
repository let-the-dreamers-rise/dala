#!/usr/bin/env bash
# Sync onchain/ from the Windows repo into the WSL build dir, then build and test there.
# Usage (from WSL): bash scripts/wsl-build.sh [build|test|deploy]
set -euo pipefail
REPO="/mnt/c/Users/ASHWIN GOYAL/OneDrive/Desktop/doradora"
WORK=/root/code/dala
mkdir -p "$WORK"
rsync -a --delete --exclude target --exclude node_modules --exclude .anchor --exclude test-ledger "$REPO/onchain/" "$WORK/"
cd "$WORK"
# Anchor 1.2 defaults to SBF v3, which LiteSVM 0.10 cannot load; v0 runs everywhere.
BUILD=(anchor build --arch v0)
case "${1:-test}" in
  build) "${BUILD[@]}" 2>&1 | tail -40 ;;
  test) "${BUILD[@]}" 2>&1 | tail -15 && readelf -h target/deploy/dala.so | grep Flags && cargo test -p dala 2>&1 | tail -60 ;;
  deploy) "${BUILD[@]}" 2>&1 | tail -5 && anchor deploy --provider.cluster devnet 2>&1 | tail -20 ;;
esac
