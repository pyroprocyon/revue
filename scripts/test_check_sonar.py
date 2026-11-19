"""Guard against a green quality check that silently omits a language or its tests."""

import contextlib
import fcntl
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("check-sonar.py")
spec = importlib.util.spec_from_file_location("check_sonar", SCRIPT)
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)


def running(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def lock_is_free():
    try:
        with quality.analysis_lock():
            return True
    except SystemExit:
        return False


CANCELLED_LAUNCHER = """
import importlib.util
from pathlib import Path
import signal
import sys

spec = importlib.util.spec_from_file_location("check_sonar", sys.argv[1])
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
gate.LOCK = Path(sys.argv[2])
gate.REPORTS = gate.LOCK.parent


def stop_on_termination(signum, frame):
    raise SystemExit(128 + signum)


signal.signal(signal.SIGTERM, stop_on_termination)
with gate.analysis_lock():
    gate.run_stoppable(("bash", "-c", "sleep 60 & echo $!; wait"))
"""


class TemporaryPasswordTests(unittest.TestCase):
    def test_generated_password_meets_sonar_policy(self):
        password = quality.temporary_admin_password()
        self.assertGreaterEqual(len(password), 43)
        self.assertTrue(any(character.islower() for character in password))
        self.assertTrue(any(character.isupper() for character in password))
        self.assertTrue(any(character.isdigit() for character in password))
        self.assertTrue(any(character in quality.string.punctuation for character in password))
        self.assertFalse(any(character.isspace() for character in password))

    def test_password_body_uses_32_bytes_of_cryptographic_randomness(self):
        with patch.object(quality.secrets, "token_urlsafe", wraps=quality.secrets.token_urlsafe) as generate:
            quality.temporary_admin_password()
        generate.assert_called_once_with(32)


class LocalPortTests(unittest.TestCase):
    def test_dynamic_and_explicit_ports_bind_only_to_loopback(self):
        self.assertEqual(quality.port_binding(""), "127.0.0.1::9000")
        self.assertEqual(quality.port_binding("19000"), "127.0.0.1:19000:9000")

    def test_invalid_ports_cannot_change_the_binding_address(self):
        for port in ("0", "65536", "bad", "-1", "9000/path", "0.0.0.0:9000", "9000:9000"):
            with self.subTest(port=port), self.assertRaises(RuntimeError):
                quality.port_binding(port)


class ScopeTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.paths = ["backend/src/main/java/Account.java", "backend/src/test/java/AccountTest.java",
                      "frontend/src/Card.tsx", "frontend/src/Card.test.tsx", "frontend/playwright.config.ts",
                      "frontend/e2e/fixtures.ts", "frontend/e2e/accounts.spec.ts"]
        for name in self.paths + ["frontend/node_modules/generated.ts", "frontend/dist/generated.js",
                                  "frontend/playwright-report/index.html", "frontend/test-results/trace.js"]:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
        reports = self.root / "reports"
        reports.mkdir()
        self.enterContext(patch.object(quality, "ROOT", self.root))
        self.enterContext(patch.object(quality, "REPORTS", reports))
        self.sonar = quality.Sonar("http://unused.invalid")

    def test_all_application_and_test_sources_are_required(self):
        for missing in self.paths:
            with self.subTest(missing=missing):
                indexed = [{"path": path} for path in self.paths if path != missing]
                with patch.object(self.sonar, "results", return_value=indexed):
                    with self.assertRaisesRegex(RuntimeError, "omitted expected source") as failure:
                        self.sonar.verify_scope()
                    self.assertIn(missing, str(failure.exception))

    def test_complete_scope_passes_without_dependencies_or_build_outputs(self):
        with patch.object(self.sonar, "results", return_value=[{"path": path} for path in self.paths]):
            self.sonar.verify_scope()
        self.assertTrue((self.root / "reports/sonar-scope.json").is_file())

    def test_analysis_credentials_cannot_be_sent_to_a_non_loopback_server(self):
        self.assertEqual(quality.loopback_url("127.0.0.1:54321"), "http://127.0.0.1:54321")
        for address in ("0.0.0.0:9000", "example.com:9000", "127.0.0.1:0", "127.0.0.1:65536",
                        "127.0.0.1:bad", "127.0.0.1:9000/path"):
            with self.subTest(address=address), self.assertRaises(RuntimeError):
                quality.loopback_url(address)

    def test_reports_include_findings_after_the_first_page(self):
        pages = [{"issues": ["first"], "paging": {"total": 2}},
                 {"issues": ["second"], "paging": {"total": 2}}]
        with patch.object(self.sonar, "api", side_effect=pages):
            self.assertEqual(self.sonar.results("issues/search?componentKeys=revue", "issues"), ["first", "second"])



class ServerLifecycleTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        reports = Path(directory.name)
        for name, value in (("REPORTS", reports), ("LOCK", reports / "sonar-analysis.lock")):
            patcher = patch.object(quality, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_start_clears_old_results(self):
        (quality.REPORTS / "sonar-gate.json").write_text("{}")
        with patch.object(quality, "run") as run:
            quality.start_server("revue-sonar-test")
        self.assertFalse((quality.REPORTS / "sonar-gate.json").exists())
        self.assertIn("revue-sonar-test", run.call_args.args)

    def test_failed_analysis_still_removes_its_own_server(self):
        started = []

        def fail_during_analysis():
            with quality.disposable_server() as container:
                started.append(container)
                raise RuntimeError("analysis failed")

        with patch.object(quality, "run"), patch.object(quality.subprocess, "run") as docker:
            self.assertRaises(RuntimeError, fail_during_analysis)
        removals = [call.args[0] for call in docker.call_args_list if call.args[0][:2] == ["docker", "rm"]]
        self.assertEqual(removals, [["docker", "rm", "--force", "--volumes", started[0]]])

    def test_startup_interrupted_after_docker_received_the_name_still_removes_that_server(self):
        def start_and_get_interrupted():
            with quality.disposable_server():
                self.fail("The server should not be handed out after an interrupted start")

        with (patch.object(quality, "run", side_effect=KeyboardInterrupt) as docker_run,
              patch.object(quality.subprocess, "run") as docker):
            self.assertRaises(KeyboardInterrupt, start_and_get_interrupted)
        arguments = docker_run.call_args.args
        named = arguments[arguments.index("--name") + 1]
        removals = [call.args[0] for call in docker.call_args_list if call.args[0][:2] == ["docker", "rm"]]
        self.assertEqual(removals, [["docker", "rm", "--force", "--volumes", named]])

    def test_a_second_analysis_in_the_checkout_stops_before_its_checks_or_server_start(self):
        with (quality.analysis_lock(), patch.object(quality, "start_server") as start,
              patch.object(quality, "run_stoppable") as checks):
            with self.assertRaises(SystemExit) as refused:
                quality.main(("check", "e2e"))
        start.assert_not_called()
        checks.assert_not_called()
        self.assertIn("Another SonarQube analysis is running", str(refused.exception))
        with quality.analysis_lock():
            pass

    def test_server_boots_during_checks_and_analysis_uses_their_outputs_under_the_lock(self):
        steps = []

        def record_step(step, **options):
            steps.append((step, lock_is_free()))

        @contextlib.contextmanager
        def server():
            steps.append(("server", lock_is_free()))
            yield "revue-sonar-test"

        with (patch.object(quality, "run_stoppable", side_effect=record_step),
              patch.object(quality, "disposable_server", server), patch.object(quality, "analyze", side_effect=record_step)):
            quality.main(("check", "e2e"))
        self.assertEqual(steps, [("server", False), (("make", "check", "e2e"), False), ("revue-sonar-test", False)])

    def test_failed_checks_stop_the_server_and_leave_no_passing_analysis(self):
        old_gate = quality.REPORTS / "sonar-gate.json"
        old_gate.write_text("{}")
        failure = subprocess.CalledProcessError(1, ("make", "check", "e2e"))
        with (patch.object(quality, "run") as start, patch.object(quality, "run_stoppable", side_effect=failure),
              patch.object(quality, "stop_server") as stop, patch.object(quality, "analyze") as scan,
              self.assertRaises(subprocess.CalledProcessError)):
            quality.main(("check", "e2e"))
        start_args = start.call_args.args
        stop.assert_called_once_with(start_args[start_args.index("--name") + 1])
        scan.assert_not_called()
        self.assertFalse(old_gate.exists())


class ProcessGroupTests(unittest.TestCase):
    def test_leaving_the_block_stops_every_process_the_command_started(self):
        with quality.process_group(("bash", "-c", "sleep 60 & echo $!; wait"), stdout=subprocess.PIPE,
                                   text=True) as shell:
            self.addCleanup(shell.stdout.close)
            child = int(shell.stdout.readline())
        self.assertFalse(running(child))

    def test_a_command_that_ignores_termination_is_killed_after_the_grace_period(self):
        ignores_termination = ("import signal, time; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
                               "print(flush=True); time.sleep(60)")
        process = subprocess.Popen((sys.executable, "-c", ignores_termination), start_new_session=True,
                                   stdout=subprocess.PIPE, text=True)
        self.addCleanup(process.stdout.close)
        process.stdout.readline()

        quality.stop_group(process, grace_seconds=0.2)

        self.assertEqual(process.returncode, -signal.SIGKILL)

    def test_a_cancelled_launcher_keeps_the_lock_until_its_processes_have_stopped(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        lock = Path(directory.name) / "sonar-analysis.lock"
        launcher_script = Path(directory.name) / "launcher.py"
        launcher_script.write_text(CANCELLED_LAUNCHER)
        launcher = subprocess.Popen((sys.executable, str(launcher_script), str(SCRIPT), str(lock)),
                                    stdout=subprocess.PIPE, text=True)
        self.addCleanup(launcher.stdout.close)
        worker = int(launcher.stdout.readline())

        launcher.send_signal(signal.SIGTERM)
        with lock.open("w") as handle:
            deadline = time.monotonic() + 30
            while True:
                try:
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    self.assertLess(time.monotonic(), deadline, "the cancelled launcher never released the lock")
                    time.sleep(0.01)
            worker_ran_after_release = running(worker)

        self.assertEqual(launcher.wait(), 128 + signal.SIGTERM)
        self.assertFalse(worker_ran_after_release)


if __name__ == "__main__":
    unittest.main()
