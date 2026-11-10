"""Exercise the publication guard against real, isolated Git repositories."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HOOK = Path(__file__).with_name("pre-push-quality.py").resolve()
MAKEFILE = HOOK.parent.parent / "Makefile"


SCANNER = r'''import json
import os
from pathlib import Path
import subprocess
import sys

args = sys.argv[1:]
config = json.loads(Path(args[args.index("--config-path") + 1]).read_text())
assert config["exit_zero"] is False
assert config["secret"]["show_secrets"] is False
assert "--all-secrets" in args and "--json" in args
assert "GITGUARDIAN_EXIT_ZERO" not in os.environ
assert "GG_MAX_DOC_SIZE" not in os.environ
assert Path(os.environ["GITGUARDIAN_DOTENV_PATH"]).is_file()
assert Path(os.environ["GITGUARDIAN_DOTENV_PATH"]).read_text() == ""
commits = subprocess.check_output(["git", "rev-list", args[-1]], text=True).splitlines()
with Path(".git/scanned.jsonl").open("a") as output:
    output.write(json.dumps(commits) + "\n")
mode = os.environ.get("TEST_GG_MODE", "")
if mode == "dirty":
    Path("tracked.txt").write_text("changed while scanning\n")
if mode == "move-head":
    subprocess.run(["git", "commit", "--allow-empty", "-qm", "moved while scanning"], check=True)
if mode in ("auth", "network", "quota"):
    sys.exit(3 if mode == "auth" else 4)
if mode == "empty":
    sys.exit(0)
if mode == "invalid":
    print("not JSON")
    sys.exit(0)
scans = []
found = False
for commit in commits:
    content = subprocess.check_output(["git", "show", commit + ":tracked.txt"], text=True)
    incidents = int("scanner-fixture-incident" in content or mode == "finding-zero")
    found |= bool(incidents)
    files = subprocess.check_output(["git", "show", "--format=", "--name-only", commit], text=True).splitlines()
    results = []
    for name in files:
        blob = subprocess.run(["git", "show", commit + ":" + name], capture_output=True)
        if b"\0" not in blob.stdout:
            results.append({"filename": name, "total_incidents": 0, "total_occurrences": 0})
    scans.append({"entities_with_incidents": [] if mode == "skip-files" else results, "id": commit, "type": "commit", "total_incidents": incidents,
                  "total_occurrences": incidents, "errors": [{}] if mode == "errors" else []})
if mode == "incomplete":
    scans = []
print(json.dumps({"type": "commit-range", "total_incidents": int(found),
                  "total_occurrences": int(found), "scans": scans}))
sys.exit(int(found and mode != "finding-zero"))
'''


class PrePushTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.environment = dict(os.environ, GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "quality-test@example.invalid")
        self.git("config", "user.name", "Quality Gate Test")
        (self.root / "tracked.txt").write_text("initial\n")
        self.git("add", "tracked.txt")
        self.git("commit", "-qm", "fixture")
        self.head = self.git("rev-parse", "HEAD").stdout.strip()
        self.base = self.head
        self.remote = self.root / ".git/remote.git"
        self.git("clone", "--bare", "-q", str(self.root), str(self.remote))
        self.commit("next")
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
        scanner = self.bin / "ggshield"
        scanner.write_text("#!" + sys.executable + "\n" + SCANNER)
        scanner.chmod(0o755)

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, env=self.environment,
                              check=True, capture_output=True, text=True)

    def commit(self, content):
        (self.root / "tracked.txt").write_text(content + "\n")
        self.git("add", "tracked.txt")
        self.git("commit", "-qm", "fixture update")
        self.head = self.git("rev-parse", "HEAD").stdout.strip()
        return self.head

    def push(self, commit=None, remote_id=None, lines=None, destination=None, **environment):
        env = dict(self.environment, PATH=str(self.bin) + os.pathsep + "/usr/bin:/bin", **environment)
        data = lines or f"refs/heads/test {commit or self.head} refs/heads/test {remote_id or '0' * 40}\n"
        return subprocess.run([sys.executable, str(HOOK), "origin", str(destination or self.remote)],
                              cwd=self.root, env=env, input=data, text=True, capture_output=True)

    def scanned(self):
        path = self.root / ".git/scanned.jsonl"
        return set().union(*(set(json.loads(line)) for line in path.read_text().splitlines()))

    def test_hook_repository_environment_does_not_leak_into_quality_checks(self):
        make = self.bin / "make"
        make.write_text("#!" + sys.executable + "\n" + """from pathlib import Path
import subprocess
import tempfile
with tempfile.TemporaryDirectory() as directory:
    subprocess.run(["git", "init", "-q", directory], check=True)
    actual = subprocess.check_output(["git", "-C", directory, "rev-parse", "--show-toplevel"], text=True).strip()
    assert actual == directory, actual
Path(".git/quality-called").write_text("quality")
""")
        result = self.push(GIT_DIR=str(self.root / ".git"), GIT_WORK_TREE=str(self.root),
                           GIT_INDEX_FILE=str(self.root / ".git/index"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / ".git/quality-called").read_text(), "quality")

    def test_new_branch_scans_every_commit_since_remote_main(self):
        first = self.head
        second = self.commit("another clean change")
        result = self.push()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {first, second})

    def test_first_repository_push_scans_full_history(self):
        self.git("--git-dir", str(self.remote), "update-ref", "-d", "refs/heads/main")
        result = self.push()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {self.base, self.head})

    def test_existing_branch_rescans_full_pr_range_not_just_new_tip(self):
        previous = self.head
        self.git("--git-dir", str(self.remote), "fetch", "-q", str(self.root),
                 f"{previous}:refs/heads/test")
        self.commit("latest change")
        result = self.push(remote_id=previous)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {previous, self.head})

    def test_force_update_covers_pr_and_remote_ranges(self):
        previous = self.head
        self.git("--git-dir", str(self.remote), "fetch", "-q", str(self.root),
                 f"{previous}:refs/heads/test")
        self.git("checkout", "-q", "-b", "rewritten", self.base)
        replacement = self.commit("rewritten change")
        result = self.push(remote_id=previous)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {replacement})

    def test_missing_advertised_object_is_fetched_and_covered(self):
        self.git("--git-dir", str(self.remote), "config", "user.email", "fixture@example.invalid")
        self.git("--git-dir", str(self.remote), "config", "user.name", "Fixture")
        tree = self.git("rev-parse", self.base + "^{tree}").stdout.strip()
        remote_only = self.git("--git-dir", str(self.remote), "commit-tree", tree, "-p", self.base,
                               "-m", "remote-only fixture").stdout.strip()
        self.git("--git-dir", str(self.remote), "update-ref", "refs/heads/test", remote_only)
        result = self.push(remote_id=remote_only)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {self.head})
        self.git("cat-file", "-e", remote_only)

    def test_mutation_while_scanning_blocks_before_quality(self):
        for mode in ("dirty", "move-head"):
            with self.subTest(mode=mode):
                result = self.push(TEST_GG_MODE=mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((self.root / ".git/quality-called").exists())
                self.git("reset", "--hard", self.head)

    def test_multiple_refs_require_every_advertised_remote_range(self):
        line = f"refs/heads/test {self.head} refs/heads/test {self.base}\n"
        tag_line = f"refs/tags/fixture {self.head} refs/tags/fixture {'0' * 40}\n"
        result = self.push(lines=line + tag_line)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {self.head})

    def test_no_new_commits_still_scans_the_outgoing_tip(self):
        self.git("--git-dir", str(self.remote), "fetch", "-q", str(self.root),
                 f"{self.head}:refs/heads/main")
        result = self.push(remote_id=self.head)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {self.head})

    def test_merge_resolution_after_rename_scans_the_destination(self):
        original = self.root / "a.txt"
        common = "".join(f"common fixture line {index}\n" for index in range(30))
        original.write_text("base\n" + common)
        self.git("add", "a.txt")
        self.git("commit", "-qm", "rename base")
        self.git("checkout", "-qb", "rename-side")
        self.git("mv", "a.txt", "b.txt")
        (self.root / "b.txt").write_text("side\n" + common)
        self.git("add", "b.txt")
        self.git("commit", "-qm", "side rename")
        self.git("checkout", "-q", "main")
        original.write_text("main\n" + common)
        self.git("commit", "-qam", "main change")
        merge = subprocess.run(["git", "merge", "rename-side", "-m", "merge"], cwd=self.root,
                               env=self.environment, capture_output=True, text=True)
        self.assertNotEqual(merge.returncode, 0)
        (self.root / "b.txt").write_text("resolved\n" + common)
        self.git("add", "-A")
        self.git("commit", "-qm", "resolve rename")
        self.head = self.git("rev-parse", "HEAD").stdout.strip()
        result = self.push()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(self.head, self.scanned())

    def test_intermediate_finding_blocks_even_when_tip_is_clean(self):
        self.commit("scanner-fixture-incident")
        self.commit("removed the fixture")
        result = self.push()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_missing_scanner_blocks_before_quality(self):
        (self.bin / "ggshield").unlink()
        result = self.push()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ggshield", result.stderr)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_auth_network_quota_and_invalid_reports_block(self):
        for mode in ("auth", "network", "quota", "empty", "incomplete", "errors", "finding-zero", "invalid", "skip-files"):
            with self.subTest(mode=mode):
                result = self.push(TEST_GG_MODE=mode)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertFalse((self.root / ".git/quality-called").exists())

    def test_inherited_bypasses_and_exclusions_cannot_skip_findings(self):
        (self.root / ".gitguardian.yaml").write_text("version: 2\nexit_zero: true\n")
        self.git("add", ".gitguardian.yaml")
        self.git("commit", "-qm", "scanner config fixture")
        self.commit("scanner-fixture-incident")
        result = self.push(GITGUARDIAN_EXIT_ZERO="true", GITGUARDIAN_MAX_COMMITS_FOR_HOOK="1",
                           GITGUARDIAN_DOTENV_PATH=".env", GITGUARDIAN_SHOW_SECRETS="true")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_git_grafts_cannot_hide_intermediate_commits(self):
        previous = self.head
        self.commit("latest clean fixture")
        grafts = self.root / ".git/info/grafts"
        grafts.write_text(self.head + "\n")
        result = self.push()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {previous, self.head})

    def test_inherited_document_size_cannot_silently_skip_files(self):
        result = self.push(GG_MAX_DOC_SIZE="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {self.head})

    def test_textconv_cannot_replace_committed_contents(self):
        self.git("config", "diff.hidden.textconv", "echo harmless")
        result = self.push()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("textconv", result.stderr)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_unscannable_binary_change_blocks_publication(self):
        (self.root / "binary.bin").write_bytes(b"binary\0payload")
        self.git("add", "binary.bin")
        self.git("commit", "-qm", "unscannable fixture")
        self.head = self.git("rev-parse", "HEAD").stdout.strip()
        result = self.push()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_large_range_is_not_limited_by_hook_commit_cap(self):
        expected = {self.head}
        for index in range(52):
            self.git("commit", "--allow-empty", "-qm", f"fixture {index}")
            expected.add(self.git("rev-parse", "HEAD").stdout.strip())
        self.head = self.git("rev-parse", "HEAD").stdout.strip()
        result = self.push(GITGUARDIAN_MAX_COMMITS_FOR_HOOK="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), expected)

    def test_shallow_history_is_blocked(self):
        (self.root / ".git/shallow").write_text(self.head + "\n")
        result = self.push()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_unavailable_remote_blocks_before_quality(self):
        result = self.push(destination=self.root / "missing.git")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / ".git/quality-called").exists())

    def test_annotated_tag_uses_its_commit_history(self):
        self.git("tag", "-a", "fixture-tag", "-m", "fixture")
        tag = self.git("rev-parse", "fixture-tag").stdout.strip()
        result = self.push(lines=f"refs/tags/fixture-tag {tag} refs/tags/fixture-tag {'0' * 40}\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.scanned(), {self.head})

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
