#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
ASC_BIN="$REPO_ROOT/tools/bin/asc"

if [[ ! -x "$ASC_BIN" ]]; then
  echo "Missing asc binary at $ASC_BIN. Run: cd $REPO_ROOT/tools/App-Store-Connect-CLI && make build" >&2
  exit 1
fi

cd "$APP_DIR"
export ASC_BYPASS_KEYCHAIN="${ASC_BYPASS_KEYCHAIN:-1}"
export PATH="$REPO_ROOT/tools/bin:$PATH"

if [[ ! -f .asc/export-options-app-store.plist ]]; then
  echo "Missing .asc/export-options-app-store.plist" >&2
  echo "Copy .asc/export-options-app-store.plist.example and edit team/signing settings first." >&2
  exit 1
fi

"$ASC_BIN" workflow validate --file .asc/workflow.json --pretty
"$ASC_BIN" workflow run testflight_beta "$@"
