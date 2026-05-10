#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
BUNDLE_DIR="$REPO_ROOT/docs/agent-workstreams/specialist-creation/agentcreator-profile-bundle"
PROFILE_HOME="${HERMES_AGENTCREATOR_HOME:-$HOME/.hermes/profiles/agentcreator}"

if ! command -v hermes >/dev/null 2>&1; then
  echo "error: hermes is not on PATH" >&2
  exit 1
fi

if [ ! -d "$PROFILE_HOME" ]; then
  echo "Creating Hermes profile: agentcreator"
  hermes profile create agentcreator --clone --no-alias
fi

mkdir -p "$PROFILE_HOME/skills/agents-cloud"
cp "$BUNDLE_DIR/SOUL.md" "$PROFILE_HOME/SOUL.md"
cp -R "$BUNDLE_DIR/skills/agents-cloud/"* "$PROFILE_HOME/skills/agents-cloud/"

python3 - "$PROFILE_HOME/config.yaml" "$BUNDLE_DIR/config.agentcreator.yaml" <<'PY'
from pathlib import Path
import sys
try:
    import yaml  # type: ignore
except Exception:
    yaml = None

config_path = Path(sys.argv[1])
fragment_path = Path(sys.argv[2])
if yaml is None:
    raise SystemExit("PyYAML is required by Hermes; run inside the Hermes Python environment or install pyyaml")
config = yaml.safe_load(config_path.read_text()) if config_path.exists() else {}
frag = yaml.safe_load(fragment_path.read_text())

def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict):
            merge(a[k], v)
        else:
            a[k] = v
    return a

config = merge(config or {}, frag)
config_path.write_text(yaml.safe_dump(config, sort_keys=False))
PY

ENV_FILE="$PROFILE_HOME/.env"
touch "$ENV_FILE"
if ! grep -q '^APIFY_TOKEN=' "$ENV_FILE"; then
  cat >> "$ENV_FILE" <<'EOF'

# Apify API token for Agent Creator discovery/prototyping.
# Get one from https://console.apify.com/account/integrations
APIFY_TOKEN=
EOF
fi

mkdir -p "$HOME/.local/bin"
ln -sf "$REPO_ROOT/tools/apifycli/apifycli" "$HOME/.local/bin/apifycli"
chmod +x "$REPO_ROOT/tools/apifycli/apifycli"

echo "Installed Agent Creator Hermes profile bundle."
echo "Profile home: $PROFILE_HOME"
echo "Apify CLI: $(command -v apifycli || true)"
echo "Next: set APIFY_TOKEN in $ENV_FILE, then run:"
echo "  hermes --profile agentcreator skills list | grep agents-cloud"
echo "  APIFY_TOKEN=... apifycli me"
