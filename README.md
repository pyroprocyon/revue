# Revue

Revue is a study app for Filipino students preparing for classes and exams. Test yourself by answering from memory before checking the card.

**[Try Revue at revuetayo.com](https://revuetayo.com).** Choose **Browse sets**, pick a subject, then select **Try 5 cards**. You don't need an account.

## What you can do today

- Browse shared sets on Philippine History, Philippine Nature, and Weather & Disasters.
- Try five questions, check the answers and their sources, then rate each attempt.
- Share a set with classmates.

Practice isn't saved. The example schedule shows when cards could come back.

Revue is in early development. The current build also supports invitation-only pilot accounts for adults aged 18 and over. Saving sets, creating personal decks, and scheduling reviews from saved progress are planned.

## Help and feedback

For questions, card corrections, account help, or privacy requests, email [revuetayo@gmail.com](mailto:revuetayo@gmail.com). Requests are handled personally.

## Run locally

Use WSL, Linux, or macOS with Docker, Docker Compose 2.20.2 or newer, GNU Make, and Bash. Keep WSL checkouts in the Linux filesystem and enable Docker Desktop's WSL integration.

From the repository root:

```bash
make
```

Open [the local app](http://127.0.0.1:5173). The first start downloads dependencies. `make` creates `.env` from `.env.example` only when it is missing. Run it again after backend or dependency changes; frontend source changes reload automatically.

`make stop` stops the containers and keeps local data. `make help` lists the other commands. Host ports can be changed in `.env`. For a local pilot account, `make invite` prints a signup link.

## Development and contributions

Discuss a proposed change in a repository issue first. Keep changes focused and leave out credentials, private learning material, and personal data.

Host checks also need Java 25, the Node version in `.nvmrc`, Python 3, and `unzip`, with Docker running. Make selects the pinned Node version for frontend commands.

```bash
make check          # Lint, tests, type checks, and frontend build
make smoke          # Build containers and check HTTP responses
make install-hooks  # Enable the publication checks once per clone
```

On a fresh Linux host, install Chromium's system libraries before browser tests:

```bash
make frontend-install
cd frontend
bash ../scripts/with-node.sh npx --no-install playwright install --with-deps --only-shell chromium
```

Then return to the repository root. Before a pull request or code push, run `make quality` for browser tests and static analysis too. Publication also requires an authenticated [GitGuardian ggshield](https://docs.gitguardian.com/ggshield-docs/getting-started) scan of every outgoing commit; the pre-push guard enforces both checks. Missing or incomplete scans block publication.

## License and credits

All rights reserved. This repository has no open-source license.

Study cards credit their sources. The [Inter font license](frontend/public/fonts/inter-LICENSE.txt) is included. The Java style configuration is adapted from [Checkstyle's Google profile](https://checkstyle.org/google-style.html).
