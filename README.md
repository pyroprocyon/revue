# Revue

Revue is a spaced-repetition review app for Philippine students. A student tries to recall an answer, compares it with the reference, and reviews the card again when Revue schedules it.

The app is under development. The current build provides a React application shell, a Spring Boot backend, PostgreSQL, session storage and health checks. The backend includes a daily scheduler using FSRS-6 (Java library 1.0.0) with a 90% desired retention target. It uses the student’s local calendar date and returns the next review date and state. Invited learners can create a username/password account, sign in and sign out. Saving sets and personal review progress are still in development.

For support, feedback, card inaccuracies or privacy requests, email [revuetayo@gmail.com](mailto:revuetayo@gmail.com). This is a manually monitored pilot inbox. Email verification and self-service email recovery remain deferred.

## Local development

Use WSL, Linux or macOS. On WSL, keep the checkout in the Linux filesystem for faster builds and file access.

To start the app, you need Docker running with Compose v2.20.2 or newer, GNU Make and Bash. In WSL, enable Docker Desktop's integration for your distro. Java, Node and frontend dependencies run inside the containers.

From the repo root:

```bash
make
```

This is the same as `make start` or `make up`. It creates `.env` from `.env.example` only if missing, builds changed images, starts PostgreSQL, Spring Boot and Vite, then waits for all three to become healthy. The first run downloads images and dependencies, so it needs internet access and takes longer.

Open [Revue](http://127.0.0.1:5173). Vite forwards `/api` and `/actuator` to the backend. [Backend health](http://127.0.0.1:5173/actuator/health) should return `{"status":"UP"}`. Protected API requests require authentication.

The backend at [127.0.0.1:8080](http://127.0.0.1:8080) serves the React production build, as the deployed site does. It reflects the frontend as of the last `make`, without live reload.

- React source changes reload live. The development container uses file polling for Docker Desktop compatibility and keeps its dependencies separate from host `node_modules`.
- After changing backend code, frontend dependencies or Docker configuration, run `make` again. It rebuilds changed images while preserving the database. Backend live reload is not configured; use the IDE workflow below for debugging.
- `make stop` stops and removes the containers, keeping database data. `make start` starts the stack again. `make up` and `make down` remain available.
- `make rebuild` rebuilds changed images and restarts changed containers. `make rebuild-clean` rebuilds without cache.
- `make logs SERVICE=frontend` or `make logs SERVICE=backend` shows logs. `make ps` shows status. `make help` lists commands.
- All published ports bind to localhost: frontend 5173, backend 8080, database 5433. If a port is occupied, change `FRONTEND_PORT`, `BACKEND_PORT` or `DB_PORT` in `.env` and run `make` again. The printed frontend URL uses the actual port.
- Database credentials initialize a new volume only. Editing them in `.env` does not change an existing database's credentials. Keep the original values unless you deliberately change the database user too.
- `make reset` deletes the local database only after confirmation. It is not needed for normal startup or rebuilds.

### Try a pilot account locally

After `make` starts the stack, create the shared pilot invitation:

```bash
make invite
```

Share the one link printed by the command with all pilot testers. It uses `/i#<code>` and remains reusable for seven days. Running `make invite` again replaces the shared link and revokes the previous one. The database stores only its hash. Existing single-use invitations still work until redeemed or expired. The default link uses port 5173; for another frontend address run `python3 scripts/issue-pilot-invite.py --origin http://127.0.0.1:<port>`. Keep the shared invitation within the pilot group. Reopen the original link if you refresh an unfinished registration.

Choose a username (3–32 letters, numbers, underscores or hyphens) and a password (6–64 characters; common passwords are rejected). Retype the password, then accept the pilot privacy notice and confirm that you are at least 18. No email account or email provider setup is needed. Sign in again at `/sign-in`; `/account` shows your username and sign-out control. Password recovery tooling, saving sets and personal review history come in later slices. Email verification and self-service email recovery remain on the roadmap.

### Rolling back the first account release

Authenticated sessions from the username/password release contain a serialized principal class that the earlier account-foundation release cannot load. If rolling back to that earlier release after anyone has signed in, pause incoming traffic and stop the newer app instances before invalidating their authenticated sessions in Revue’s application database:

```sql
DELETE FROM spring_session
WHERE primary_id IN (
    SELECT session_primary_id
    FROM spring_session_attributes
    WHERE attribute_name = 'SPRING_SECURITY_CONTEXT'
);
```

The existing foreign key removes the related session attributes. This signs learners out and preserves accounts, credentials and learning content. Deploy the older release before reopening traffic. Keep V5 and V6 applied; no reverse migration or removal of username rows is needed. Shared invitations require the new release and are unavailable while running an older build. Username sign-in becomes available again when the newer release is restored. This is an operator procedure, not an automatic deployment action.

### Checks

`make smoke` starts the stack and uses host `curl` to check the React entry, backend health and a protected API request through Vite. It then checks the production build served by the backend: the page, a browser route reload, a compressed hashed asset and a missing asset's 404. It saves no application data.

To run tests on the host, also install Temurin Java 25, Node 26.13.0, Python 3 and `unzip` (needed by the Maven Wrapper). Docker must be running for Testcontainers. Node can be installed with nvm; Make selects the pinned installed version for its frontend commands.

```bash
make check
```

This installs frontend packages from the lockfile with `npm ci`, runs `./mvnw verify` and Vitest, then type-checks and builds the frontend for production. Backend tests use a separate PostgreSQL 18.6 container, not the development database. `make test` runs just the tests; `make build` installs, type-checks and builds the frontend. Make's host checks need network access on the first run for dependencies.

For editor support, `make frontend-install` installs host packages without starting services. To run Vite on the host instead, stop the container frontend with `docker compose stop frontend`, then run `npm run dev` in `frontend/` using Node 26.13.0. If the backend uses a nondefault port, set `API_PROXY_TARGET=http://127.0.0.1:<port>` for that command.

### Browser journeys

```bash
make e2e
```

This installs the pinned Playwright browser and runs eleven Chromium journeys against the real production image and a fresh PostgreSQL database. Tests cover invited signup with a six-character password, policy links, session persistence, logout/sign-in, rejected credentials, shared-set return navigation, separate browser accounts, shared and legacy invitation rules, short public set links, public support links at phone/desktop widths, keyboard access to a scrolling privacy notice, invitation recovery on an already-open form, and offline sign-in retry. These tests do not mock the account API or add test-only application endpoints.

Each worker owns a separate Compose project with a random database password, an unexposed database and a random loopback app port. It removes its containers, database volume and image tag on teardown, including ordinary test/setup failures. It does not use the development `.env` database, fixed development ports or existing users. Chromium uses the same local HTTP profile as the development stack; the backend production-profile tests cover secure cookies and forwarded HTTPS.

On a fresh Linux host, install the browser's system libraries once after `make frontend-install`:

```bash
cd frontend
bash ../scripts/with-node.sh npx --no-install playwright install --with-deps --only-shell chromium
```

The suite uses one worker and no automatic retries. Failures keep screenshots, traces and stack logs in `frontend/test-results/`; the HTML report is in `frontend/playwright-report/`. Run `cd frontend && bash ../scripts/with-node.sh npx --no-install playwright show-report` to inspect it. Reports contain disposable synthetic test accounts and stay out of Git, application images and source analysis. Chromium emulation does not replace a real-phone/password-manager check.

`make quality` includes this suite, so the pre-push guard and required CI job enforce the browser journeys. CI installs Linux browser dependencies and retains reports for seven days even when a test fails. `make check` remains the faster lint/unit/integration/type/build gate. See [Playwright fixtures](https://playwright.dev/docs/test-fixtures) and its [CI guidance](https://playwright.dev/docs/ci).

### Automated code quality

`make check` enforces Oxlint on frontend JavaScript/TypeScript (including React hooks), the project Java style on production and test Java, and syntax/tests for Python and shell tooling. Java checks run during Maven `validate`, before compilation, so the existing pre-push and CI quality gate enforce the same standard.

The Java baseline in `backend/config/google-checkstyle.xml` is copied from [Checkstyle's Google profile](https://checkstyle.org/google-style.html) in the pinned 14.4.0 release. Revue changes only indentation to four-space blocks/eight-space continuations and the line limit to 120 columns. The remaining Google rules are retained, including import order, naming and required public API documentation. Violations are errors. The supplemental `backend/config/checkstyle.xml` keeps the existing correctness checks and nesting limit. Both profiles include production and test Java.

```bash
make format-java
cd backend && ./mvnw validate
```

`make format-java` applies pinned Google Java Format 1.37.0 through Maven. The shared `backend/format-java.sh` wrapper keeps Google import ordering and uses the formatter's four-space AOSP layout with a 120-column limit. Maven `validate` runs the same formatter in read-only check mode; documentation and naming findings still need meaningful edits. The CLI avoids a library-adapter compatibility issue and requires only the Bash/JDK tools already used by this project. Checkstyle covers the machine-checkable parts of the guide; it does not replace code review or behavioral tests.

Public set Share and Copy link actions use `/s/<code>` on the same domain. The code is the existing public set ID encoded in base 36; it exposes no learner data and always resolves the current active set. The original `/sets/<set-key>` URLs remain supported. Signup invitations use a separate cryptographically random eight-character pilot code in the fragment. Previously issued 22-character shared codes and legacy `/register#invite=...` links with 43-character codes remain supported. There is no external shortening service or referral tracking.

Before opening or updating a PR, use the full `make quality` gate. Enable its local push enforcement once per clone:

```bash
make install-hooks
```

This checkout has the guard enabled. New clones must run the installation command; Git does not distribute local hook configuration. Installation preserves existing hooks and stops rather than overwriting them. The pre-push hook checks the committed `HEAD`, refuses dirty checkouts and other outgoing revisions, requires GitGuardian to pass for the complete outgoing history, then runs `make quality`. It rejects changes made during either check. You can still run `make quality` on uncommitted work for early feedback. Deletion-only pushes do not publish code and skip application checks. Hooks are bypassable; the agent workflow and required CI remain additional enforcement. Passing checks never grants permission to commit or publish.

Install and authenticate [GitGuardian ggshield](https://docs.gitguardian.com/ggshield-docs/getting-started) before publishing code. The gate is verified with version 1.56.1. For example, with pipx installed and its command directory on `PATH`:

```bash
pipx install ggshield==1.56.1
ggshield auth login
```

Complete sign-in in your browser. Credentials stay in ggshield's user configuration, outside this repository; never paste a token into an issue or commit it. Expired credentials require another browser login.

The scanner resolves a fresh remote `main` and scans every commit between it and the outgoing tip, including intermediate commits. Existing branch/tag updates also cover the advertised remote tip through the outgoing tip, including rewritten history. If the remote has no `main`, it scans the complete reachable history. Empty selections still scan the tip.

Shallow history, unavailable remote objects, missing authentication, findings, network/quota failures and incomplete reports block publication. Each JSON report must list exactly the expected commits, include results for every changed file payload, and contain zero findings or errors. Empty files and changes that alter no bytes need no file result. Skipped payloads, including unsupported binary or oversized content, block publication.

Scans use `--all-secrets`, an isolated policy without exclusions, and a sanitized environment; inherited exit-zero settings, ignore lists, internal size limits and hook commit caps cannot waive the gate. Git replacement objects and legacy grafts cannot hide history. Active Git text conversion or external diff configuration is rejected so the scanner receives committed content. Secret values remain redacted. See [GitGuardian's commit-range reference](https://docs.gitguardian.com/ggshield-docs/reference/secret/scan/commit-range).

`make quality` remains usable without scanner credentials for local feedback and existing CI. The GitGuardian scan is an additional requirement of the push gate; hosted GitGuardian checks remain a second layer. A passing scan of existing commits does not cover uncommitted changes or later commits.

The frontend uses pinned Oxlint correctness and React-hook rules with warnings treated as failures. Its parser works independently of the TypeScript compiler; TypeScript ESLint's current peer range excludes this project's TypeScript 7. The ordinary TypeScript checks remain authoritative for types. Run `make lint` for fast lint and tooling syntax feedback.

Run `make quality` for the full checks, isolated Playwright journeys and SonarQube analysis of Java, React TypeScript/TSX and Python tooling, including tests. After a current `make check`, `make sonar` runs just that analysis. Docker, Python 3, Java 25 and the installed frontend dependencies are required. The first run downloads the pinned SonarQube image and standalone scanner.

The scanner creates a disposable SonarQube Community server on a random loopback port, changes its factory password and removes the container and its data afterward. Source stays on the machine running the check. No hosted Sonar account, stored token or production service is needed. This uses the embedded evaluation database and is not a persistent SonarQube deployment.

The `Revue static analysis` gate rejects unresolved issues across the scanned code, using the bundled Sonar way language profiles. It evaluates overall code because a fresh server has no historical new-code baseline. This static gate does not claim code coverage or replace tests, accessibility review or security-hotspot review. Reports and scanner logs are written to `backend/target/quality/`; Checkstyle writes `backend/target/checkstyle-result.xml`. Tool versions and the server image digest are pinned in the Maven build, root analysis configuration and runner.

The `Screen` scrolling container retains `tabIndex={0}` so keyboard users can reach and scroll it. One attribute-line `NOSONAR` comment documents the reviewed S6845 false positive. Its Playwright regression reaches the native `main` landmark with Tab and proves PageDown increases that container’s scroll position. This follows [MDN’s overflow accessibility guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow#accessibility); the rule remains enabled elsewhere.

The CSS analyzer does not recognize Tailwind's valid `@utility` selector context. One `stylelint-disable`/`stylelint-enable` pair scopes that single rule exception to the `pressable` utility in `frontend/src/index.css`; it does not disable other CSS checks. Production CSS remains unchanged. See the [SonarScanner CLI documentation](https://docs.sonarsource.com/sonarqube-community-build/analyzing-source-code/scanners/sonarscanner) and [Maven Checkstyle enforcement](https://maven.apache.org/plugins/maven-checkstyle-plugin/usage.html) for the underlying tools.

### Measuring page performance

Run `make` to rebuild the latest app, then run Lighthouse against [the production build at 127.0.0.1:8080](http://127.0.0.1:8080). Use the configured backend port if you changed `BACKEND_PORT`.

Port 5173 serves Vite's development modules, React debugging code and live-reload tools. Its Lighthouse score does not measure the production build. Keep the same Lighthouse device and throttling settings when comparing results. Local measurements also exclude the deployed host's network latency and cold starts.

### Running the backend from an IDE

If the full stack is running, use `make stop` first to free the backend port. Start only the database with `make db`. Then run `RevueApplication` with these environment variables, using the database port, user and password from your `.env`:

```
SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5433/revue
SPRING_DATASOURCE_USERNAME=revue
SPRING_DATASOURCE_PASSWORD=local-dev-only
```

## Layout

- `backend/`: Spring Boot 4.1 on Java 25, built with the Maven Wrapper. Flyway migrations live in `src/main/resources/db/migration`.
- `frontend/`: React 19, TypeScript 7 and Vite 8, tested with Vitest.
- `compose.yaml`, `Dockerfile` and `frontend/Dockerfile.dev`: the local stack that `make` runs.
- `scripts/`: the pinned-Node runner and the local HTTP smoke check.

The root Dockerfile builds one image: Spring Boot serving the API and the React production build at one address. The Vite container is for local development only.

## Continuous integration

The GitHub Actions workflow is configured to run the same `make quality` gate and `make smoke` on pushes and pull requests. SonarQube checks Java, TypeScript/TSX and Python; analysis or quality-gate failure fails the existing required `Tests and builds` job. Quality reports are retained as CI artifacts for seven days. This covers the backend tests against PostgreSQL 18.6, frontend tests and type checking, the production frontend build, container builds and HTTP connectivity. The workflow uses the pinned Java and Node versions and requires no deployment credentials.

Continuous deployment is not connected yet. The image turns on the production profile (`application-prod.properties`); Docker Compose turns it off for local development.

## Architecture

See [the architecture guide](docs/architecture.md) for the publishing aggregate, scheduling boundary, frontend feature structure and enforced dependency rules.

## License

All rights reserved. This repository has no open-source license.
