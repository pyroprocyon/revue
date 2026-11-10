#!/usr/bin/env python3
"""Create or replace the shared pilot invitation in the local database; show its link only to the operator."""

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
    token = secrets.token_urlsafe(6)
    digest = hashlib.sha256(token.encode()).hexdigest()
    statement = (
        "BEGIN;\n"
        "UPDATE signup_invites SET revoked_at = now() WHERE reusable AND revoked_at IS NULL;\n"
        "INSERT INTO signup_invites (id, token_hash, created_at, expires_at, reusable) VALUES "
        f"('{uuid.uuid4()}', '{digest}', now(), now() + interval '7 days', true);\n"
        "COMMIT;\n"
    )
    command = ["docker", "compose", "exec", "-T", "db", "sh", "-c",
               'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"']
    try:
        subprocess.run(command, input=statement, text=True, check=True, capture_output=True)
    except subprocess.CalledProcessError as error:
        if 'column "reusable" does not exist' in (error.stderr or ""):
            raise RuntimeError(
                "The local database needs migration V6. Run `make`, then retry `make invite`."
            ) from error
        raise RuntimeError(
            "The invitation database command failed. Check `make ps` and `make logs SERVICE=db`, then retry."
        ) from error
    return origin.rstrip("/") + "/i#" + token


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://127.0.0.1:5173")
    arguments = parser.parse_args(argv)
    # This explicit operator command is the only place that displays the shared admission link.
    try:
        print(issue(arguments.origin))
    except (RuntimeError, ValueError) as error:
        parser.exit(1, f"Invitation failed: {error}\n")


if __name__ == "__main__":
    main()
