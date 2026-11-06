#!/usr/bin/env bash
# Run a command with the installed Node version specified by .nvmrc.
set -eo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
required="v$(tr -d '[:space:]' < "$repo_dir/.nvmrc")"

if [ "$(node --version 2>/dev/null || true)" != "$required" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # Load nvm explicitly for shells that do not read interactive startup files.
    set +e
    . "$NVM_DIR/nvm.sh"
    nvm use "$required" >/dev/null 2>&1
    set -e
  fi
fi

if [ "$(node --version 2>/dev/null || true)" != "$required" ]; then
  printf 'Node %s is required. Install it with nvm install %s, then retry.\n' "$required" "$required" >&2
  exit 1
fi
exec "$@"
