#!/usr/bin/env python3
"""Check the exact checked-out commit before Git publishes any code."""

import subprocess
import sys


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def require_clean():
    if git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("Commit or set aside pending changes before pushing; the quality gate must check the committed code.")


def main():
    outgoing = []
    for line in sys.stdin:
        _, local_id, _, _ = line.split()
        if set(local_id) != {"0"}:
            outgoing.append(local_id)
    if not outgoing:
        return
    head = git("rev-parse", "HEAD")
    for local_id in outgoing:
        if git("rev-parse", "--verify", local_id + "^{commit}") != head:
            raise RuntimeError("Check out and verify each branch before pushing it; outgoing code differs from HEAD.")
    require_clean()
    subprocess.run(["make", "quality"], check=True)
    require_clean()
    if git("rev-parse", "HEAD") != head:
        raise RuntimeError("HEAD changed during verification; run the push again from the intended commit.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Push blocked: {error}", file=sys.stderr)
        sys.exit(1)
