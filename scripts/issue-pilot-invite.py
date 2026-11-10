#!/usr/bin/env python3
"""Issue one invitation in the local Compose database; show its link only to the operator."""

import argparse
import hashlib
import secrets
import subprocess
import urllib.parse
import uuid


def issue(origin):
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"} or parsed.query or parsed.fragment or parsed.username:
        raise ValueError("Use the application's origin, without a path, query or credentials")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError("Use HTTPS except on the local machine")
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    statement = ("insert into signup_invites (id, token_hash, created_at, expires_at) values "
                 f"('{uuid.uuid4()}', '{digest}', now(), now() + interval '7 days');")
    command = ["docker", "compose", "exec", "-T", "db", "sh", "-c",
               'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"']
    subprocess.run(command, input=statement, text=True, check=True, capture_output=True)
    return origin.rstrip("/") + "/register#invite=" + token


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://127.0.0.1:5173")
    arguments = parser.parse_args()
    # This explicit operator command is the only place that displays the one-time admission link.
    print(issue(arguments.origin))
