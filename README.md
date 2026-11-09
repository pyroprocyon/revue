# Revue

Revue is a spaced-repetition review app for Philippine students. A student tries to recall an answer, compares it with the reference, and reviews the card again when Revue schedules it.

The app is under development. The current build provides a React application shell, a Spring Boot backend, PostgreSQL, session storage and health checks. The backend includes a daily scheduler using FSRS-6 (Java library 1.0.0) with a 90% desired retention target. It uses the student’s local calendar date and returns the next review date and state. Account sign-in and saving reviews are still in development.

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

### Checks

`make smoke` starts the stack and uses host `curl` to check the React entry, backend health and a protected API request through Vite. It then checks the production build served by the backend: the page, a browser route reload, a compressed hashed asset and a missing asset's 404. It saves no application data.

To run tests on the host, also install Temurin Java 25, Node 26.13.0, Python 3 and `unzip` (needed by the Maven Wrapper). Docker must be running for Testcontainers. Node can be installed with nvm; Make selects the pinned installed version for its frontend commands.

```bash
make check
```

This installs frontend packages from the lockfile with `npm ci`, runs `./mvnw verify` and Vitest, then type-checks and builds the frontend for production. Backend tests use a separate PostgreSQL 18.6 container, not the development database. `make test` runs just the tests; `make build` installs, type-checks and builds the frontend. Make's host checks need network access on the first run for dependencies.

For editor support, `make frontend-install` installs host packages without starting services. To run Vite on the host instead, stop the container frontend with `docker compose stop frontend`, then run `npm run dev` in `frontend/` using Node 26.13.0. If the backend uses a nondefault port, set `API_PROXY_TARGET=http://127.0.0.1:<port>` for that command.

### Automated code quality

`make check` enforces Oxlint on frontend JavaScript/TypeScript (including React hooks), Checkstyle on production and test Java, and syntax/tests for Python and shell tooling. The small project ruleset covers imports, braces, redundant statements and nesting; violations fail Maven before compilation. Run `cd backend && ./mvnw validate` for a quick style check.

Before opening or updating a PR, use the full `make quality` gate. Enable its local push enforcement once per clone:

```bash
make install-hooks
```

This checkout has the guard enabled. New clones must run the installation command; Git does not distribute local hook configuration. Installation preserves existing hooks and stops rather than overwriting them. The pre-push hook checks the committed `HEAD`, refuses dirty checkouts and other outgoing revisions, runs `make quality`, and rejects changes made during verification. You can still run `make quality` on uncommitted work for early feedback. Deletion-only pushes do not publish code and skip application checks. Hooks are bypassable; the agent workflow and required CI remain additional enforcement. Passing checks never grants permission to commit or publish.

The frontend uses pinned Oxlint correctness and React-hook rules with warnings treated as failures. Its parser works independently of the TypeScript compiler; TypeScript ESLint's current peer range excludes this project's TypeScript 7. The ordinary TypeScript checks remain authoritative for types. Run `make lint` for fast lint and tooling syntax feedback.

Run `make quality` for the full checks followed by SonarQube analysis of Java, React TypeScript/TSX and Python tooling, including tests. After a current `make check`, `make sonar` runs just that analysis. Docker, Python 3, Java 25 and the installed frontend dependencies are required. The first run downloads the pinned SonarQube image and standalone scanner.

The scanner creates a disposable SonarQube Community server on a random loopback port, changes its factory password and removes the container and its data afterward. Source stays on the machine running the check. No hosted Sonar account, stored token or production service is needed. This uses the embedded evaluation database and is not a persistent SonarQube deployment.

The `Revue static analysis` gate rejects unresolved issues across the scanned code, using the bundled Sonar way language profiles. It evaluates overall code because a fresh server has no historical new-code baseline. This static gate does not claim code coverage or replace tests, accessibility review or security-hotspot review. Reports and scanner logs are written to `backend/target/quality/`; Checkstyle writes `backend/target/checkstyle-result.xml`. Tool versions and the server image digest are pinned in the Maven build, root analysis configuration and runner.

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
