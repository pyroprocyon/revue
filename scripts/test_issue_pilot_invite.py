import hashlib
import importlib.util
import io
import subprocess
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.parse

spec = importlib.util.spec_from_file_location("issue_invite", Path(__file__).with_name("issue-pilot-invite.py"))
invites = importlib.util.module_from_spec(spec)
spec.loader.exec_module(invites)


class InvitationTests(unittest.TestCase):
    def test_only_the_digest_is_written_to_the_database(self):
        with patch.object(invites.subprocess, "run") as database:
            link = invites.issue("http://127.0.0.1:5173")
        token = urllib.parse.urlsplit(link).fragment
        self.assertEqual(urllib.parse.urlsplit(link).path, "/i")
        statement = database.call_args.kwargs["input"]
        self.assertEqual(len(token), 8)
        self.assertIn("reusable", statement)
        self.assertIn("revoked_at", statement)
        self.assertIn("BEGIN", statement)
        self.assertIn("COMMIT", statement)
        self.assertNotIn(token, statement)
        self.assertIn(hashlib.sha256(token.encode()).hexdigest(), statement)
        self.assertTrue(database.call_args.kwargs["check"])

    def test_an_old_database_explains_how_to_apply_the_migration(self):
        failure = subprocess.CalledProcessError(3, ["docker"], stderr='ERROR: column "reusable" does not exist')
        with patch.object(invites.subprocess, "run", side_effect=failure):
            with self.assertRaisesRegex(RuntimeError, "Run `make`"):
                invites.issue("http://127.0.0.1:5173")

    def test_database_failures_do_not_expose_sql_or_invitation_values(self):
        failure = subprocess.CalledProcessError(3, ["docker"], stderr="internal SQL or private values")
        with patch.object(invites.subprocess, "run", side_effect=failure):
            with self.assertRaises(RuntimeError) as caught:
                invites.issue("http://127.0.0.1:5173")
        self.assertNotIn("internal SQL", str(caught.exception))
        self.assertIn("make logs", str(caught.exception))

    def test_the_command_reports_failures_without_a_traceback_or_link(self):
        output, errors = io.StringIO(), io.StringIO()
        with patch.object(invites, "issue", side_effect=RuntimeError("Run `make` before retrying")):
            with patch("sys.stdout", output), patch("sys.stderr", errors):
                with self.assertRaises(SystemExit) as stopped:
                    invites.main([])
        self.assertEqual(stopped.exception.code, 1)
        self.assertEqual(output.getvalue(), "")
        self.assertIn("Invitation failed:", errors.getvalue())
        self.assertNotIn("Traceback", errors.getvalue())

    def test_credentials_and_non_local_plain_http_are_rejected(self):
        for origin in ("http://example.com", "https://user:secret@example.com", "https://example.com/path"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                invites.issue(origin)


if __name__ == "__main__":
    unittest.main()
