import subprocess
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile


VERIFIER = Path(__file__).resolve().parents[1] / "backend/config/release/com/revue/tools/VerifyPublicArtifact.java"


class ReleaseArtifactTest(unittest.TestCase):
    def test_java_runtime_view_of_packaged_resources(self):
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            dist = root / "dist"
            dist.mkdir()
            (dist / "index.html").write_bytes(b"current homepage")
            release = root / "release"
            release.mkdir()
            with ZipFile(release / "app.jar", "w") as app:
                app.writestr("static/index.html", b"current homepage")

            def verify():
                return subprocess.run(
                    ["java", str(VERIFIER), str(dist), str(release)], capture_output=True, text=True, check=False
                )

            lib = release / "library.jar"
            with ZipFile(lib, "w") as dependency:
                dependency.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\r\nMulti-Release: true\r\n\r\n")
                dependency.writestr("META-INF/versions/21/private/notes.txt", "internal fixture")
            clean = verify()
            self.assertEqual(clean.returncode, 0, clean.stderr)
            with ZipFile(lib, "a") as dependency:
                dependency.writestr("META-INF/versions/21/static/notes.txt", "public fixture")
            rejected = verify()
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("Unexpected packaged resource: static/notes.txt", rejected.stderr)
