#!/usr/bin/env bash
# Exercise the running stack over HTTP, not just container health:
# the Vite development server and its proxy, then the React production build served by the backend.
set -euo pipefail
frontend_url="${1:?Pass the frontend URL}"
backend_url="${2:?Pass the backend URL}"

fail() { echo "$1" >&2; exit 1; }
# Response headers only, lowercased and without carriage returns, for simple matching.
headers() {
  curl --fail --silent --show-error --max-time 10 --output /dev/null --dump-header - "$@" \
    | tr -d '\r' | tr '[:upper:]' '[:lower:]'
}
status_of() {
  curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "$1"
}

# Vite development server and its proxy.
html=$(curl --fail --silent --show-error --max-time 10 "$frontend_url/")
[[ "$html" == *'id="root"'* && "$html" == *'/src/main.tsx'* ]] \
  || fail 'The frontend did not return the React entry page.'
entry=$(curl --fail --silent --show-error --max-time 10 "$frontend_url/src/main.tsx")
[[ "$entry" == *'createRoot'* ]] || fail 'The frontend entry module did not load.'
health=$(curl --fail --silent --show-error --max-time 10 "$frontend_url/actuator/health/readiness")
[[ "$health" == '{"status":"UP"}' ]] || fail 'Backend health failed through the frontend proxy.'
status=$(status_of "$frontend_url/api/v1/me")
[[ "$status" == 401 ]] || fail "Protected API returned $status instead of 401 through the proxy."
# The public sets work signed out, and there is more than one with a five-card trial. The app
# receives content from the one-off publisher before the serving instance starts.
for attempt in 1 2 3 4 5 6; do
  # A failed request or a list without trial sets is retried, so neither may stop the script here.
  sets=$(curl --fail --silent --show-error --max-time 10 "$frontend_url/api/v1/public-sets" || true)
  trial_sets=$(grep -o '"trialAvailable":true' <<< "$sets" | wc -l || true)
  (( trial_sets >= 2 )) && break
  sleep 1
done
(( trial_sets >= 2 )) || fail "Expected at least 2 public sets with the trial; found $trial_sets."
first_set=$(grep -o '"setKey":"[a-z0-9-]*"' <<< "$sets" | head -n 1 | cut -d '"' -f 4)
status=$(status_of "$frontend_url/api/v1/public-sets/$first_set/demo-cards")
[[ "$status" == 200 ]] || fail "The trial cards for $first_set returned $status instead of 200."

# The production build, served by the backend itself, as the deployed site serves it.
page=$(curl --fail --silent --show-error --max-time 10 "$backend_url/")
[[ "$page" == *'id="root"'* && "$page" != *'/src/main.tsx'* ]] \
  || fail 'The backend did not return the React production build.'
script_pattern='/assets/[^"]+\.js'
[[ "$page" =~ $script_pattern ]] || fail 'The production page names no built script.'
asset=${BASH_REMATCH[0]}
# Assign before testing, so a failed request stops the script instead of matching nothing.
home_headers=$(headers "$backend_url/")
[[ "$home_headers" != *'x-robots-tag'* ]] || fail 'The home page must stay indexable.'

# Reloading a browser route loads the same page, kept out of search results.
route_page=$(curl --fail --silent --show-error --max-time 10 "$backend_url/review/smoke-check")
[[ "$route_page" == "$page" ]] || fail 'A browser route did not return the React page.'
route_headers=$(headers "$backend_url/review/smoke-check")
[[ "$route_headers" == *'x-robots-tag: noindex'* ]] \
  || fail 'A browser route is missing X-Robots-Tag: noindex.'

# A built asset is cached for a year and served precompressed.
asset_headers=$(headers --header 'Accept-Encoding: br' "$backend_url$asset")
[[ "$asset_headers" == *'content-encoding: br'* ]] || fail "$asset was not served precompressed."
[[ "$asset_headers" == *'immutable'* ]] || fail "$asset is missing its long cache lifetime."
status=$(status_of "$backend_url/assets/missing-smoke-check.js")
[[ "$status" == 404 ]] || fail "A missing asset returned $status instead of 404."

echo 'Local smoke check passed: Vite and its proxy, and the production build served by the backend.'
