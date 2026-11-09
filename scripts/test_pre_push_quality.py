"""Exercise the publication guard against real, isolated Git repositories."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HOOK = Path(__file__).with_name("pre-push-quality.py").resolve()
MAKEFILE = HOOK.parent.parent / "Makefile"


class PrePushTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.environment = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
        self.git("init", "-q")
        self.git("config", "user.email", "quality-test@example.invalid")
        self.git("config", "user.name", "Quality Gate Test")
        (self.root / "tracked.txt").write_text("initial\n")
        self.git("add", "tracked.txt")
        self.git("commit", "-qm", "fixture")
        self.head = self.git("rev-parse", "HEAD").stdout.strip()
        self.bin = self.root / ".git/test-bin"
        self.bin.mkdir()
        make = self.bin / "make"
        make.write_text("""#!/bin/sh
printf '%s' "$*" > .git/quality-called
if [ "${TEST_DIRTY:-}" = yes ]; then echo changed >> tracked.txt; fi
if [ "${TEST_MOVE_HEAD:-}" = yes ]; then git commit --allow-empty -qm moved; fi
exit "${TEST_EXIT:-0}"
""")
        make.chmod(0o755)

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, env=self.environment,
                              check=True, capture_output=True, text=True)

    def push(self, commit=None, **environment):
        env = dict(self.environment, PATH=str(self.bin) + os.pathsep + self.environment["PATH"], **environment)
        data = f"refs/heads/test {commit or self.head} refs/heads/test {'0' * 40}\n"
        return subprocess.run([sys.executable, str(HOOK)], cwd=self.root, env=env,
                              input=data, text=True, capture_output=True)

    def test_clean_head_runs_the_complete_quality_command(self):
        result = self.push()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / ".git/quality-called").read_text(), "quality")

    def test_dirty_checkout_is_blocked_before_checks(self):
        (self.root / "pending.py").write_text("pending = True\n")
        result = self.push()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("committed code", result.stderr)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_failed_quality_check_blocks_publication(self):
        self.assertNotEqual(self.push(TEST_EXIT="2").returncode, 0)

    def test_mutation_during_checks_blocks_publication(self):
        self.assertNotEqual(self.push(TEST_DIRTY="yes").returncode, 0)

    def test_head_change_during_checks_blocks_publication(self):
        result = self.push(TEST_MOVE_HEAD="yes")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("HEAD changed", result.stderr)

    def test_unchecked_outgoing_commit_is_blocked(self):
        self.git("commit", "--allow-empty", "-qm", "another revision")
        result = self.push()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("differs from HEAD", result.stderr)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_deletion_only_does_not_run_application_checks(self):
        self.assertEqual(self.push("0" * 40).returncode, 0)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_hook_installation_preserves_existing_hooks(self):
        for hook_name in ("pre-push", "pre-commit", "commit-msg"):
            with self.subTest(hook=hook_name):
                existing = self.root / ".git/hooks" / hook_name
                existing.write_text("#!/bin/sh\nexit 0\n")
                existing.chmod(0o755)
                result = subprocess.run(["make", "-f", str(MAKEFILE), "install-hooks"],
                                        cwd=self.root, env=self.environment, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(existing.read_text(), "#!/bin/sh\nexit 0\n")
                configured = subprocess.run(["git", "config", "--local", "--get", "core.hooksPath"],
                                           cwd=self.root, env=self.environment, capture_output=True, text=True)
                self.assertEqual(configured.returncode, 1)
                existing.unlink()


if __name__ == "__main__":
    unittest.main()
