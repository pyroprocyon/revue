#!/usr/bin/env python3
"""Print the stable local and public pilot links, creating the private code only once."""

import argparse
import os
from pathlib import Path
import re
import secrets
import shutil
import urllib.parse

SETTING = "REVUE_PILOT_INVITE_CODE"


def read_setting(path, name):
    if not path.exists():
        return ""
    setting = ""
    for line in path.read_text().splitlines():
        key, separator, value = line.strip().partition("=")
        if separator and key.strip() == name:
            setting = value.strip().strip("\"'")
    return setting


def invitation_code(env_file):
    code = os.environ.get(SETTING, read_setting(env_file, SETTING))
    if SETTING in os.environ and not code:
        raise ValueError(f"Remove the empty shell override for {SETTING} so .env can supply it")
    if code:
        if not re.fullmatch(r"(?:[A-Za-z0-9_-]{8}|[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})", code):
            raise ValueError(f"{SETTING} must contain 8, 22 or 43 URL-safe characters")
        return code
    if not env_file.exists():
        shutil.copyfile(env_file.with_name(".env.example"), env_file)
        env_file.chmod(0o600)
    code = secrets.token_urlsafe(6)
    text = env_file.read_text()
    line = f"{SETTING}={code}"
    if re.search(rf"^[ \t]*{SETTING}[ \t]*=.*$", text, flags=re.MULTILINE):
        text = re.sub(rf"^[ \t]*{SETTING}[ \t]*=.*$", line, text, flags=re.MULTILINE)
    else:
        text = text.rstrip("\n") + "\n" + line + "\n"
    env_file.chmod(0o600)
    env_file.write_text(text)
    return code


def invitation_link(origin, code):
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"} or parsed.query or parsed.fragment or parsed.username:
        raise ValueError("Use the application's origin, without a path, query or credentials")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError("Use HTTPS except on the local machine")
    return origin.rstrip("/") + "/i#" + code


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", help="Override the local app address")
    parser.add_argument("--ensure", action="store_true", help="Prepare the private code without printing it")
    arguments = parser.parse_args(argv)
    env_file = Path(".env")
    try:
        code = invitation_code(env_file)
        if not arguments.ensure:
            port = os.environ.get("FRONTEND_PORT", read_setting(env_file, "FRONTEND_PORT") or "5173")
            local = invitation_link(arguments.origin or f"http://127.0.0.1:{port}", code)
            public = invitation_link("https://revuetayo.com", code)
            print(f"Local:  {local}\nPublic: {public}")
            print(f"\nUse the same Render environment setting: {SETTING}={code}")
            print("After changing the setting, run `make` locally and redeploy the public app.")
    except (OSError, ValueError) as error:
        # Do not include file contents or credential values in errors.
        message = str(error) if isinstance(error, ValueError) else "Could not read or save the private .env file"
        parser.exit(1, f"Invitation failed: {message}\n")


if __name__ == "__main__":
    main()
