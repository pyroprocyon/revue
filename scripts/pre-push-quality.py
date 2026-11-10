#!/usr/bin/env python3
"""Scan all outgoing history, then check the exact commit Git will publish."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def git(*args):
    environment = dict(os.environ, GIT_NO_REPLACE_OBJECTS="1", GIT_GRAFT_FILE=os.devnull)
    return subprocess.check_output(["git", *args], env=environment, text=True).strip()


def require_clean():
    if git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("Commit or set aside pending changes before pushing; the quality gate must check the committed code.")


def remote_commit(object_id, destination):
    exists = subprocess.run(["git", "cat-file", "-e", object_id], capture_output=True)
    if exists.returncode:
        subprocess.run(["git", "fetch", "--no-tags", "--no-write-fetch-head", destination, object_id], check=True)
    return git("rev-parse", "--verify", object_id + "^{commit}")


def scan_selections(head, remote_ids, destination):
    if git("rev-parse", "--is-shallow-repository") != "false":
        raise RuntimeError("Fetch complete history before pushing; shallow history cannot prove scan coverage.")
    main = git("ls-remote", "--refs", destination, "refs/heads/main").splitlines()
    if main:
        base = remote_commit(main[0].split()[0], destination)
        selections = [f"{base}..{head}"]
    else:
        selections = [head]  # An empty remote has no trusted baseline: scan the full history.
    for object_id in remote_ids:
        if set(object_id) != {"0"}:
            base = remote_commit(object_id, destination)
            selections.append(f"{base}..{head}")
    covered = set()
    for selection in selections:
        expected = set(git("rev-list", selection).splitlines())
        if expected - covered:
            yield selection, expected
            covered.update(expected)
    if not covered:
        yield head + "^!", {head}


def scanner_environment(dotenv_path):
    authentication = {"GITGUARDIAN_API_KEY", "GITGUARDIAN_API_URL", "GITGUARDIAN_INSTANCE"}
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith(("GITGUARDIAN_", "GG_")) or key in authentication}
    environment["GITGUARDIAN_DOTENV_PATH"] = str(dotenv_path)
    environment["GIT_NO_REPLACE_OBJECTS"] = "1"
    environment["GIT_GRAFT_FILE"] = os.devnull
    environment.pop("GIT_EXTERNAL_DIFF", None)
    return environment


def require_original_git_contents():
    settings = subprocess.run(["git", "config", "--name-only", "--get-regexp",
                               r"^diff\..*\.(textconv|command)$|^diff\.external$"],
                              capture_output=True, text=True)
    if settings.returncode not in (0, 1):
        raise RuntimeError("Cannot inspect Git diff configuration before scanning.")
    if settings.stdout:
        raise RuntimeError("Disable Git textconv/external diff configuration before scanning committed contents.")


def changed_content_paths(commit):
    entries = git("show", "--format=", "--raw", "-z", "--cc", "--no-abbrev", "--root",
                  "--find-renames", "--no-ext-diff", "--no-textconv", commit).split("\0")
    empty_blob = subprocess.check_output(["git", "hash-object", "--stdin"], input=b"").decode().strip()
    paths = set()
    index = 0
    while index < len(entries) and entries[index]:
        header = entries[index].lstrip("\n")
        parents = len(header) - len(header.lstrip(":"))
        fields = header.split()
        blobs = fields[parents + 1:2 * (parents + 1)]
        status = fields[-1]
        index += 1
        path = entries[index]
        index += 1
        if parents == 1 and status.startswith(("R", "C")):
            path = entries[index]
            index += 1
        previous, current = blobs[:-1], blobs[-1]
        if current in previous:
            continue  # Renames and permission changes with identical bytes introduce no content.
        nonempty = [blob for blob in blobs if set(blob) != {"0"} and blob != empty_blob]
        if nonempty:
            paths.add(path)
    return paths


def verify_scan_report(report, expected):
    if not isinstance(report, dict) or report.get("type") != "commit-range":
        raise RuntimeError("GitGuardian returned an invalid commit-range report.")
    scans = report.get("scans", [])
    if not isinstance(scans, list) or any(not isinstance(scan, dict) for scan in scans):
        raise RuntimeError("GitGuardian returned an invalid commit list.")
    if {scan.get("id") for scan in scans if scan.get("type") == "commit"} != expected:
        raise RuntimeError("GitGuardian did not report every expected commit; incomplete scans block publication.")
    for scan in scans:
        actual_paths = {result.get("filename") for result in scan.get("entities_with_incidents", [])}
        if changed_content_paths(scan["id"]) - actual_paths:
            raise RuntimeError("GitGuardian skipped changed file contents; incomplete scans block publication.")
    pending = [report]
    while pending:
        node = pending.pop()
        if node.get("errors") or node.get("total_incidents") != 0 or node.get("total_occurrences") != 0:
            raise RuntimeError("GitGuardian reported findings or scan errors; publication is blocked.")
        pending.extend(node.get("scans", []))
        pending.extend(node.get("entities_with_incidents", []))


def scan_history(head, remote_ids, destination):
    require_original_git_contents()
    with tempfile.TemporaryDirectory(prefix="revue-gitguardian-") as directory:
        dotenv_path = Path(directory) / ".env"
        dotenv_path.write_text("")
        environment = scanner_environment(dotenv_path)
        policy = Path(directory) / "policy.json"
        policy.write_text(json.dumps({"version": 2, "exit_zero": False, "secret": {"show_secrets": False}}))
        for selection, expected in scan_selections(head, remote_ids, destination):
            print(f"GitGuardian: scanning {len(expected)} commits in {selection}", flush=True)
            command = ["ggshield", "--config-path", str(policy), "secret", "scan", "commit-range",
                       "--all-secrets", "--json", selection]
            try:
                result = subprocess.run(command, env=environment, capture_output=True, text=True)
            except FileNotFoundError as error:
                raise RuntimeError("Install ggshield and run ggshield auth login before pushing.") from error
            if result.returncode:
                raise RuntimeError(f"GitGuardian scan failed (exit {result.returncode}). "
                                   "Resolve findings, authentication, network or quota errors before pushing.")
            try:
                report = json.loads(result.stdout)
            except json.JSONDecodeError as error:
                raise RuntimeError("GitGuardian returned no valid report; skipped scans block publication.") from error
            verify_scan_report(report, expected)
            print(f"GitGuardian passed: {len(expected)} commits, zero findings.", flush=True)


def quality_environment():
    environment = dict(os.environ)
    for key in git("rev-parse", "--local-env-vars").splitlines():
        environment.pop(key, None)
    return environment


def main():
    outgoing = []
    remote_ids = []
    for line in sys.stdin:
        _, local_id, _, remote_id = line.split()
        if set(local_id) != {"0"}:
            outgoing.append(local_id)
            remote_ids.append(remote_id)
    if not outgoing:
        return
    if len(sys.argv) != 3:
        raise RuntimeError("Run this gate through Git's pre-push hook with its remote arguments.")
    head = git("rev-parse", "HEAD")
    for local_id in outgoing:
        if git("rev-parse", "--verify", local_id + "^{commit}") != head:
            raise RuntimeError("Check out and verify each branch before pushing it; outgoing code differs from HEAD.")
    require_clean()
    scan_history(head, remote_ids, sys.argv[2])
    require_clean()
    if git("rev-parse", "HEAD") != head:
        raise RuntimeError("HEAD changed during scanning; run the push again from the intended commit.")
    subprocess.run(["make", "quality"], env=quality_environment(), check=True)
    require_clean()
    if git("rev-parse", "HEAD") != head:
        raise RuntimeError("HEAD changed during verification; run the push again from the intended commit.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Push blocked: {error}", file=sys.stderr)
        sys.exit(1)
