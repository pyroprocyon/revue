import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.parse

spec = importlib.util.spec_from_file_location("issue_invite", Path(__file__).with_name("issue-pilot-invite.py"))
invites = importlib.util.module_from_spec(spec)
spec.loader.exec_module(invites)


class InvitationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = Path(self.temp.name) / ".env"
        self.env.write_text("POSTGRES_PASSWORD=existing-local-value\nFRONTEND_PORT=5174\n")
        environment = patch.dict(os.environ, {}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)

    def test_repeated_requests_keep_one_code_and_preserve_database_settings(self):
        code = invites.invitation_code(self.env)
        saved = self.env.read_bytes()
        self.assertEqual(invites.invitation_code(self.env), code)
        self.assertEqual(self.env.read_bytes(), saved)
        self.assertIn("POSTGRES_PASSWORD=existing-local-value\n", self.env.read_text())
        self.assertEqual(len(code), 8)

    def test_local_and_public_links_use_the_same_code(self):
        code = invites.invitation_code(self.env)
        for origin in ["http://127.0.0.1:5174", "https://revuetayo.com"]:
            link = urllib.parse.urlsplit(invites.invitation_link(origin, code))
            self.assertEqual(link.path, "/i")
            self.assertEqual(link.fragment, code)

    def test_empty_example_setting_is_filled_once(self):
        self.env.write_text("REVUE_PILOT_INVITE_CODE=\n")
        code = invites.invitation_code(self.env)
        self.assertEqual(self.env.read_text(), f"REVUE_PILOT_INVITE_CODE={code}\n")
        self.assertEqual(invites.invitation_code(self.env), code)

    def test_first_setup_uses_the_example_without_changing_it(self):
        self.env.unlink()
        example = self.env.with_name(".env.example")
        example.write_text("FRONTEND_PORT=5173\n")
        invites.invitation_code(self.env)
        self.assertEqual(example.read_text(), "FRONTEND_PORT=5173\n")
        self.assertEqual(self.env.stat().st_mode & 0o777, 0o600)

    def test_environment_override_matches_compose_without_rewriting_the_file(self):
        before = self.env.read_bytes()
        with patch.dict(os.environ, {invites.SETTING: "TestCode"}):
            self.assertEqual(invites.invitation_code(self.env), "TestCode")
        self.assertEqual(self.env.read_bytes(), before)

    def test_invalid_code_is_not_printed_or_silently_replaced(self):
        self.env.write_text("REVUE_PILOT_INVITE_CODE=invalid-private-code!\n")
        before = self.env.read_bytes()
        with self.assertRaises(ValueError) as caught:
            invites.invitation_code(self.env)
        self.assertNotIn("invalid-private-code", str(caught.exception))
        self.assertEqual(self.env.read_bytes(), before)

    def test_ensure_does_not_print_the_code(self):
        with patch.object(invites, "invitation_code", return_value="TestCode"):
            output = io.StringIO()
            with patch("sys.stdout", output):
                invites.main(["--ensure"])
        self.assertEqual(output.getvalue(), "")

    def test_last_setting_wins_when_the_file_contains_duplicate_keys(self):
        self.env.write_text("REVUE_PILOT_INVITE_CODE=OldCode1\nREVUE_PILOT_INVITE_CODE=NewCode1\n")
        self.assertEqual(invites.invitation_code(self.env), "NewCode1")

    def test_an_empty_shell_override_does_not_rotate_the_saved_code(self):
        self.env.write_text("REVUE_PILOT_INVITE_CODE=TestCode\n")
        before = self.env.read_bytes()
        with patch.dict(os.environ, {invites.SETTING: ""}):
            with self.assertRaisesRegex(ValueError, "empty shell override"):
                invites.invitation_code(self.env)
        self.assertEqual(self.env.read_bytes(), before)

    def test_credentials_and_non_local_plain_http_are_rejected(self):
        for origin in ("http://example.com", "https://user:secret@example.com", "https://example.com/path"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                invites.invitation_link(origin, "TestCode")


if __name__ == "__main__":
    unittest.main()
