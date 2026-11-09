"""Guard against a green quality check that silently omits a language or its tests."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("check_sonar", Path(__file__).with_name("check-sonar.py"))
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)


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


class ScopeTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.paths = ["backend/src/main/java/Account.java", "backend/src/test/java/AccountTest.java",
                      "frontend/src/Card.tsx", "frontend/src/Card.test.tsx"]
        for name in self.paths + ["frontend/node_modules/generated.ts", "frontend/dist/generated.js"]:
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


if __name__ == "__main__":
    unittest.main()
