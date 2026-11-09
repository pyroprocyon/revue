#!/usr/bin/env python3
"""Run an isolated SonarQube analysis of Java and TypeScript; retain reports, not credentials."""

import base64
import json
import hashlib
import os
from pathlib import Path
import secrets
import signal
import string
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "backend/target/quality"
IMAGE = "sonarqube:26.11.0.134175-community@sha256:1ce197471f5f2bac347694a336862fd2c23e9f57c6edb46acebbfbe70f2c7d9c"
PROJECT = "revue"


def run(*args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, text=True, **kwargs)


def scanner_command():
    scanner = REPORTS / "sonar-scanner-cli.jar"
    expected = "786856d9bead1c2012d1bb0800f3c4172eedd1a2e97a6786d69e454efbd03d6f"
    if not scanner.exists():
        url = ("https://repo.maven.apache.org/maven2/org/sonarsource/scanner/cli/sonar-scanner-cli/"
               "8.3.1.16491/sonar-scanner-cli-8.3.1.16491.jar")
        with urllib.request.urlopen(url, timeout=60) as response:
            content = response.read()
        if hashlib.sha256(content).hexdigest() != expected:
            raise RuntimeError("Downloaded scanner checksum mismatch")
        scanner.write_bytes(content)
    if hashlib.sha256(scanner.read_bytes()).hexdigest() != expected:
        raise RuntimeError("Cached scanner checksum mismatch; remove backend/target/quality/sonar-scanner-cli.jar")
    classpath = REPORTS / "java-classpath.txt"
    run(str(ROOT / "backend/mvnw"), "-f", "backend/pom.xml", "--batch-mode", "--no-transfer-progress",
        "org.apache.maven.plugins:maven-dependency-plugin:3.11.0:build-classpath",
        f"-Dmdep.outputFile={classpath}", "-Dmdep.includeScope=test")
    libraries = classpath.read_text().strip().replace(os.pathsep, ",")
    java = str(Path(os.environ["JAVA_HOME"]) / "bin/java") if "JAVA_HOME" in os.environ else "java"
    return [java, "-jar", str(scanner), f"-Dsonar.java.libraries={libraries}",
            f"-Dsonar.java.test.libraries={libraries}"]


def loopback_url(address):
    host, _, port = address.rpartition(":")
    if host != "127.0.0.1" or not port.isdecimal() or not 1 <= int(port) <= 65535:
        raise RuntimeError("Analysis server must bind only to an IPv4 loopback port")
    return f"http://127.0.0.1:{port}"


def temporary_admin_password():
    groups = (string.ascii_lowercase, string.ascii_uppercase, string.digits, string.punctuation)
    random_prefix = "".join(secrets.choice(group) for group in groups)
    return random_prefix + secrets.token_urlsafe(32)


class Sonar:
    def __init__(self, url):
        self.url = url
        self.password = "admin"  # Factory credential on this newly created, loopback-only server.

    def api(self, path, values=None):
        data = None if values is None else urllib.parse.urlencode(values).encode()
        credentials = base64.b64encode(f"admin:{self.password}".encode()).decode()
        request = urllib.request.Request(self.url + "/api/" + path, data=data,
                                         headers={"Authorization": "Basic " + credentials})
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read()
            return json.loads(body) if body else {}

    def wait_until_ready(self):
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            try:
                if self.api("system/status").get("status") == "UP":
                    return
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                pass  # Startup is asynchronous; a bounded deadline still fails the build.
            time.sleep(2)
        raise RuntimeError("SonarQube did not become ready within four minutes")

    def configure(self):
        password = temporary_admin_password()
        self.api("users/change_password", {"login": "admin", "previousPassword": self.password, "password": password})
        self.password = password
        self.api("projects/create", {"project": PROJECT, "name": "Revue"})
        gate = self.api("qualitygates/create", {"name": "Revue static analysis"})
        self.api("qualitygates/create_condition", {"gateName": gate["name"], "metric": "violations", "op": "GT", "error": "0"})
        self.api("qualitygates/select", {"projectKey": PROJECT, "gateName": gate["name"]})
        return self.api("user_tokens/generate", {"name": "disposable-analysis"})["token"]

    def results(self, path, field, page_size=500):
        rows = []
        page = 1
        while True:
            result = self.api(f"{path}&ps={page_size}&p={page}")
            rows.extend(result[field])
            if len(rows) >= result["paging"]["total"]:
                return rows
            page += 1

    def verify_scope(self):
        components = self.results(f"components/tree?component={PROJECT}&strategy=all", "components")
        indexed = {component.get("path") for component in components}
        expected = {str(path.relative_to(ROOT))
                    for source in ("backend/src/main/java", "backend/src/test/java")
                    for path in (ROOT / source).rglob("*.java")}
        expected.update(str(path.relative_to(ROOT)) for path in (ROOT / "scripts").glob("*.py"))
        for directory, directories, files in os.walk(ROOT / "frontend"):
            directories[:] = [name for name in directories if name not in {"node_modules", "dist", "coverage"}]
            for name in files:
                path = Path(directory) / name
                if path.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html"} and not name.endswith(".d.ts"):
                    expected.add(str(path.relative_to(ROOT)))
        (REPORTS / "sonar-scope.json").write_text(json.dumps(sorted(path for path in indexed if path), indent=2) + "\n")
        missing = expected - indexed
        if missing:
            raise RuntimeError("SonarQube omitted expected source files: " + ", ".join(sorted(missing)))
        print(f"Verified analysis scope: {len(expected)} Java, frontend and Python source/test files", flush=True)

    def save_findings(self):
        findings = self.results(f"issues/search?componentKeys={PROJECT}&resolved=false", "issues")
        (REPORTS / "sonar-issues.json").write_text(json.dumps(findings, indent=2) + "\n")
        for finding in findings:
            path = finding["component"].removeprefix(PROJECT + ":")
            print(f'{path}:{finding.get("line", 1)} {finding["rule"]}: {finding["message"]}', flush=True)
        hotspots = self.results(f"hotspots/search?project={PROJECT}", "hotspots", page_size=100)
        (REPORTS / "sonar-hotspots.json").write_text(json.dumps(hotspots, indent=2) + "\n")
        print(f"Security hotspots requiring contextual review: {len(hotspots)}", flush=True)
        gate = self.api(f"qualitygates/project_status?projectKey={PROJECT}")
        (REPORTS / "sonar-gate.json").write_text(json.dumps(gate, indent=2) + "\n")
        self.verify_scope()
        return gate["projectStatus"]["status"]


def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    # A failed run must not leave an earlier passing result looking current.
    for filename in ("sonar-issues.json", "sonar-gate.json", "sonar-hotspots.json", "sonar-scope.json",
                     "sonar-scanner.log", "sonar-server.log"):
        (REPORTS / filename).unlink(missing_ok=True)
    container = "revue-sonar-" + uuid.uuid4().hex[:12]
    try:
        print("Starting disposable SonarQube for Java, TypeScript and Python analysis", flush=True)
        run("docker", "run", "--detach", "--rm", "--name", container,
            "--publish", "127.0.0.1::9000", "--env", "SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true",
            "--env", "SONAR_TELEMETRY_ENABLE=false", IMAGE, stdout=subprocess.DEVNULL)
        address = run("docker", "port", container, "9000/tcp", capture_output=True).stdout.strip()
        sonar = Sonar(loopback_url(address))
        sonar.wait_until_ready()
        token = sonar.configure()
        environment = dict(os.environ, SONAR_TOKEN=token, SONAR_HOST_URL=sonar.url)
        command = scanner_command()
        with (REPORTS / "sonar-scanner.log").open("w") as log:
            analysis = subprocess.run(command, cwd=ROOT, env=environment, stdout=log, stderr=subprocess.STDOUT, text=True)
        # Always collect findings even when the scanner reports a failed quality gate.
        status = sonar.save_findings()
        print(f"SonarQube quality gate: {status}. Reports: {REPORTS}", flush=True)
        if analysis.returncode or status != "OK":
            raise RuntimeError("SonarQube analysis or quality gate failed; see backend/target/quality")
    finally:
        with (REPORTS / "sonar-server.log").open("w") as log:
            subprocess.run(["docker", "logs", container], stdout=log, stderr=subprocess.STDOUT, check=False)
        subprocess.run(["docker", "rm", "--force", "--volumes", container],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    def stop_on_termination(signum, frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, stop_on_termination)
    main()
