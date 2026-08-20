#!/usr/bin/env bash
set -euo pipefail

# Root start script for Railpack/Railway
# Installs dependencies for the telegram-bot package, builds, and starts it.
# This script assumes the telegram-bot directory contains a package.json with
# start/build scripts. It is intentionally defensive and will print helpful
# logs if something is missing.

TELEGRAM_DIR="telegram-bot"

echo "[start.sh] Starting app from root. Using directory: ${TELEGRAM_DIR}"

if [ ! -d "${TELEGRAM_DIR}" ]; then
  echo "[start.sh] ERROR: Directory ${TELEGRAM_DIR} not found"
  exit 1
fi

cd "${TELEGRAM_DIR}"

if [ -f package.json ]; then
  echo "[start.sh] Found package.json — installing dependencies"
  npm ci --silent || npm install --silent
  echo "[start.sh] Running build (if defined)"
  if npm run | grep -q "build"; then
    npm run build --if-present
  fi
  echo "[start.sh] Starting app via npm start"
  npm run start
else
  echo "[start.sh] ERROR: package.json not found in ${TELEGRAM_DIR}."
  echo "Please ensure the telegram-bot package has a start script or add one to package.json."
  exit 1
fi
