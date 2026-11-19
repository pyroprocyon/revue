#!/usr/bin/env python3
"""make quality-local: make check, then the browser tests and both SonarQube analyses, under the checkout lock.

SonarQube boots and the SonarQube for IDE scan runs while the browser tests run, instead of one after another.
Measured November 17, 2026 on a 12-core WSL machine: the full gate took 368 s instead of 414 s, and the browser
tests took about a minute longer.
"""

import importlib.util
from pathlib import Path
import signal
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CHECKS = ("make", "check")
IDE_SCAN = ("bash", "scripts/with-node.sh", "bash", "scripts/scan-sonar-ide.sh")
BROWSER_TESTS = (
    ("npx", "--no-install", "playwright", "install", "--only-shell", "chromium"),
    ("npm", "run", "test:e2e"),
)


def load_server_analysis():
    spec = importlib.util.spec_from_file_location("check_sonar", ROOT / "scripts/check-sonar.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


server_analysis = load_server_analysis()


def run_browser_tests():
    for command in BROWSER_TESTS:
        server_analysis.run_stoppable(("bash", "../scripts/with-node.sh", *command), cwd=ROOT / "frontend")


def main():
    scan_output = server_analysis.REPORTS / "sonar-ide-scan.out"
    with server_analysis.analysis_lock():
        server_analysis.run_stoppable(CHECKS, cwd=ROOT)
        with (scan_output.open("w") as output,
              server_analysis.process_group(IDE_SCAN, cwd=ROOT, stdout=output, stderr=subprocess.STDOUT) as scan):
            with server_analysis.disposable_server() as container:
                run_browser_tests()
                server_analysis.analyze(container)
            scan_status = scan.wait()
        print(scan_output.read_text(), end="", flush=True)
        if scan_status != 0:
            raise SystemExit(scan_status)
        subprocess.run((sys.executable, "scripts/check-sonar-ide.py"), cwd=ROOT, check=True)


if __name__ == "__main__":
    def stop_on_termination(signum, frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, stop_on_termination)
    main()
