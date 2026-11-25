import importlib.util
from pathlib import Path
import signal
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "quality_local_analysis", Path(__file__).with_name("quality-local-analysis.py"))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


class MakeEntryPointTests(unittest.TestCase):
    def test_quality_targets_start_their_locked_launcher_before_anything_installs_dependencies(self):
        for target, launcher in (("quality-local", "python3 scripts/quality-local-analysis.py"),
                                 ("quality", "python3 scripts/check-sonar.py lint e2e check")):
            with self.subTest(target=target):
                plan = subprocess.run(("make", "-n", "--no-print-directory", target), cwd=local.ROOT,
                                      capture_output=True, text=True, check=True).stdout
                self.assertNotIn("npm ci", plan)
                self.assertEqual(plan.strip().splitlines()[-1], launcher)


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        reports = Path(directory.name)
        analysis = local.server_analysis
        for name, value in (("REPORTS", reports), ("LOCK", reports / "sonar-analysis.lock")):
            patcher = patch.object(analysis, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_failed_browser_tests_remove_the_server_and_stop_the_scan(self):
        analysis = local.server_analysis
        real_popen = subprocess.Popen
        scans = []

        def start_scan(*args, **kwargs):
            scans.append(real_popen(*args, **kwargs))
            return scans[-1]

        failure = subprocess.CalledProcessError(1, "npm run test:e2e")
        with (patch.object(local, "IDE_SCAN", ("sleep", "60")),
              patch.object(local.subprocess, "Popen", side_effect=start_scan),
              patch.object(analysis, "run_stoppable") as checks,
              patch.object(analysis, "start_server") as start_server,
              patch.object(analysis, "stop_server") as stop_server,
              patch.object(analysis, "analyze") as analyze,
              patch.object(local, "run_browser_tests", side_effect=failure),
              self.assertRaises(subprocess.CalledProcessError)):
            local.main()
        checks.assert_called_once_with(local.CHECKS, cwd=local.ROOT)
        stop_server.assert_called_once_with(start_server.call_args.args[0])
        analyze.assert_not_called()
        self.assertEqual(scans[0].returncode, -signal.SIGTERM)


if __name__ == "__main__":
    unittest.main()
