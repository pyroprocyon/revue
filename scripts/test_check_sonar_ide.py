"""Exercise the local SonarQube for IDE gate."""

import importlib.util
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("check_sonar_ide", Path(__file__).with_name("check-sonar-ide.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class SonarIdeGateTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.source = self.root / "component.ts"
        self.source.write_text("unrelated();\nknownCase();\n")
        self.issue = {"fileUri": self.source.as_uri(), "ruleKey": "typescript:S1234", "textRange": {"startLine": 2},
                      "primaryMessage": "Synthetic finding"}
        self.exception = {"path": "component.ts", "rule": "typescript:S1234", "source": "knownCase();",
                          "reason": "The behavior is intentional in this test."}
        self.report = {"inputFiles": ["component.ts"], "issues": [self.issue]}

    def test_open_finding_blocks_the_gate(self):
        self.assertFalse(gate.passes(self.root, self.report, []))

    def test_exception_is_consumed_once(self):
        self.assertTrue(gate.passes(self.root, self.report, [self.exception]))
        self.report["issues"].append(self.issue)
        self.assertFalse(gate.passes(self.root, self.report, [self.exception]))

    def test_missing_report_scope_is_an_error(self):
        self.report["inputFiles"] = []
        with self.assertRaisesRegex(ValueError, "input files"):
            gate.passes(self.root, self.report, [])

    def test_stale_exception_blocks_the_gate(self):
        self.report["issues"] = []
        self.assertFalse(gate.passes(self.root, self.report, [self.exception]))
