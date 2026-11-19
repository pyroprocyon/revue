#!/usr/bin/env bash
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

check_context() {
  local name=$1 directory=$2 dockerfile=$3 asset=$4
  shift 4
  local context="$scratch/$name" output="$scratch/$name-output" path
  mkdir -p "$context/$(dirname "$asset")"
  cp "$directory/.dockerignore" "$context/.dockerignore"
  if [[ -f "$directory/$dockerfile.dockerignore" ]]; then
    cp "$directory/$dockerfile.dockerignore" "$context/$dockerfile.dockerignore"
  fi
  printf 'FROM scratch\nCOPY . /\n' > "$context/$dockerfile"
  touch "$context/$asset"
  for path in "$@"; do
    mkdir -p "$context/$(dirname "$path")"
    touch "$context/$path"
  done
  docker buildx build --quiet --network=none --file "$context/$dockerfile" \
    --output "type=local,dest=$output" "$context" > /dev/null
  [[ -f "$output/$asset" ]] || { echo "$name omitted required asset $asset" >&2; return 1; }
  for path in "$@"; do
    [[ ! -e "$output/$path" ]] || { echo "$name included private build input $path" >&2; return 1; }
  done
}

check_context production "$repo" Dockerfile frontend/public/favicon.svg \
  .env frontend/.env.production frontend/public/nested/.env backend/.sonar/cache/marker \
  content/private/marker backend/src/.agents/marker
check_context development "$repo/frontend" Dockerfile.dev public/favicon.svg \
  .env public/nested/.env.local public/nested/.env src/.agents/marker
