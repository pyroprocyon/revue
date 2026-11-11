#!/usr/bin/env python3
"""Block publication on unresolved SonarQube for IDE findings."""

import json
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit


def passes(root, report, exceptions):
    if not report.get("inputFiles"):
        raise ValueError("SonarQube for IDE reported no input files.")
    pending = {}
    for entry in exceptions:
        key = (entry["path"], entry["rule"], entry["source"])
        if not entry["reason"].strip() or key in pending:
            raise ValueError(f"Invalid SonarQube for IDE exception for {entry['path']} {entry['rule']}.")
        pending[key] = entry["reason"]

    open_issues = 0
    for issue in report["issues"]:
        file = Path(unquote(urlsplit(issue["fileUri"]).path))
        path = file.relative_to(root).as_posix()
        line = issue.get("textRange", {}).get("startLine")
        rule = issue["ruleKey"]
        if line is not None:
            lines = file.read_text(encoding="utf-8").splitlines()
            key = (path, rule, lines[line - 1].strip())
            if pending.pop(key, None) is not None:
                continue
        print(f"{path}:{line or 1} {rule}: {issue['primaryMessage']}")
        open_issues += 1

    for path, rule, _ in pending:
        print(f"Remove stale SonarQube for IDE exception: {path} {rule}")
    if open_issues or pending:
        print(f"SonarQube for IDE gate failed: {open_issues} unresolved findings, {len(pending)} stale exceptions.")
        return False
    print(f"SonarQube for IDE gate passed with {len(exceptions)} documented exceptions.")
    return True


def main():
    root = Path(__file__).resolve().parents[1]
    report = root / "backend/target/quality/sonar-ide-issues.json"
    exceptions = root / "scripts/sonar-ide-exceptions.json"
    try:
        return 0 if passes(root, json.loads(report.read_text()), json.loads(exceptions.read_text())) else 1
    except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
        print(f"SonarQube for IDE gate could not read the report or exceptions: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
