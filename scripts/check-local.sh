#!/usr/bin/env bash
# Exercise the actual development server and proxy, not just container health.
set -euo pipefail
base_url="${1:?Pass the frontend URL}"
html=$(curl --fail --silent --show-error --max-time 10 "$base_url/")
[[ "$html" == *'id="root"'* && "$html" == *'/src/main.tsx'* ]] || {
  echo 'The frontend did not return the React entry page.' >&2; exit 1;
}
entry=$(curl --fail --silent --show-error --max-time 10 "$base_url/src/main.tsx")
[[ "$entry" == *'createRoot'* ]] || { echo 'The frontend entry module did not load.' >&2; exit 1; }
health=$(curl --fail --silent --show-error --max-time 10 "$base_url/actuator/health")
[[ "$health" == '{"status":"UP"}' ]] || { echo 'Backend health failed through the frontend proxy.' >&2; exit 1; }
status=$(curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "$base_url/api/v1/me")
[[ "$status" == 401 ]] || { echo "Protected API returned $status instead of 401 through the proxy." >&2; exit 1; }
echo 'Local smoke check passed: React entry, backend health and protected API proxy.'
