#!/usr/bin/env bash
# Run the installed IntelliJ plugin's bundled analysis engine from WSL or Linux.
set -euo pipefail

plugin=${SONAR_IDE_PLUGIN:-}
if [[ -z "$plugin" ]]; then
    shopt -s nullglob
    candidates=("${XDG_DATA_HOME:-$HOME/.local/share}"/JetBrains/IntelliJIdea*/sonarlint-intellij)
    if command -v cmd.exe >/dev/null && command -v wslpath >/dev/null &&
        appdata=$(cmd.exe /d /c 'echo %APPDATA%' 2>/dev/null) &&
        windows_config=$(wslpath -u "${appdata%$'\r'}" 2>/dev/null); then
        candidates+=("$windows_config"/JetBrains/IntelliJIdea*/plugins/sonarlint-intellij)
    fi
    for candidate in "${candidates[@]}"; do
        if [[ -f "$candidate"/plugins/eslint-bridge/package/package.json ]] &&
            [[ -z "$plugin" || "$candidate" -nt "$plugin" ]]; then
            plugin=$candidate
        fi
    done
fi
if [[ -z "$plugin" || ! -d "$plugin/sloop/lib" || ! -d "$plugin/lib" ||
    ! -f "$plugin/plugins/eslint-bridge/package/package.json" ]]; then
    echo 'Install SonarQube for IDE in IntelliJ, or set SONAR_IDE_PLUGIN to its sonarlint-intellij directory.' >&2
    exit 1
fi
plugin=$(cd -- "$plugin" && pwd -P)

reports="$PWD/backend/target/quality"
mkdir -p -- "$reports"
work=$(mktemp -d "$reports/.sonar-ide.XXXXXXXX")
trap 'rm -rf -- "$work"' EXIT

if [[ ! -f frontend/node_modules/.package-lock.json ]]; then
    make frontend-install
fi
(
    cd backend
    ./mvnw --batch-mode --no-transfer-progress test-compile \
        org.apache.maven.plugins:maven-dependency-plugin:3.11.0:build-classpath \
        "-Dmdep.outputFile=$work/classpath" -Dmdep.includeScope=test
)

java=java
if [[ -n "${JAVA_HOME:-}" ]]; then
    java="$JAVA_HOME/bin/java"
fi
git ls-files -z --cached --others --exclude-standard >"$work/files"
if ! "$java" --class-path "$plugin/lib/*" scripts/sonar-ide/com/revue/tools/SonarIdeScan.java \
    "$plugin" "$work" "$(command -v node)" \
    >"$work/engine.log" 2>&1; then
    mv -- "$work/engine.log" "$reports/sonar-ide.log"
    tail -n 25 "$reports/sonar-ide.log" >&2
    printf 'SonarQube for IDE scan failed. See %s\n' "$reports/sonar-ide.log" >&2
    exit 1
fi
mv -- "$work/engine.log" "$reports/sonar-ide.log"
mv -- "$work/report.json" "$reports/sonar-ide-issues.json"
printf 'SonarQube for IDE report saved to %s\n' "$reports/sonar-ide-issues.json"
