import hashlib
import importlib.util
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
        token = urllib.parse.parse_qs(urllib.parse.urlsplit(link).fragment)["invite"][0]
        statement = database.call_args.kwargs["input"]
        self.assertEqual(len(token), 43)
        self.assertNotIn(token, statement)
        self.assertIn(hashlib.sha256(token.encode()).hexdigest(), statement)
        self.assertTrue(database.call_args.kwargs["check"])

    def test_credentials_and_non_local_plain_http_are_rejected(self):
        for origin in ("http://example.com", "https://user:secret@example.com", "https://example.com/path"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                invites.issue(origin)


if __name__ == "__main__":
    unittest.main()
