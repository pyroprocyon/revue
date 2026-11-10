#!/usr/bin/env bash
# Maven resolves the pinned formatter; this wrapper shares its options across check and apply.
set -euo pipefail

mode="${1:?Expected check or apply}"
formatter="${2:?Expected the Maven-resolved formatter jar}"
java_command="${JAVA_HOME:+$JAVA_HOME/bin/}java"
case "$mode" in
  check) options=(--dry-run --set-exit-if-changed) ;;
  apply) options=(--replace) ;;
  *) echo "Expected check or apply" >&2; exit 2 ;;
esac

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
source_list="$(mktemp "${TMPDIR:-/tmp}/revue-java-format.XXXXXX")"
trap 'rm -f -- "$source_list"' EXIT
find src/main/java src/test/java -type f -name '*.java' -print0 >"$source_list"
sources=()
while IFS= read -r -d '' source; do
  sources+=("$source")
done <"$source_list"
rm -f -- "$source_list"
trap - EXIT
if ((${#sources[@]} == 0)); then
  echo "No production or test Java sources found" >&2
  exit 1
fi

# Keep Google import ordering while AOSP provides four-space layout.
"$java_command" -jar "$formatter" --fix-imports-only "${options[@]}" "${sources[@]}"
exec "$java_command" -jar "$formatter" --aosp --max-line-length=120 --skip-sorting-imports "${options[@]}" "${sources[@]}"
