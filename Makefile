# Local development commands for Revue.
#
# Run these from WSL (Ubuntu), Linux or macOS. They need GNU Make and
# Docker Compose v2.20.2 or newer. Run `make` to start, or `make help` for the list.
#
# Most targets accept SERVICE=<name> to act on one service only:
#   make logs SERVICE=backend
#   make restart SERVICE=db

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := up

COMPOSE    ?= docker compose
SERVICE    ?=
DB_SERVICE ?= db

# Test commands, run inside the backend and frontend folders. Override them if the layout changes.
BACKEND_DIR   ?= backend
FRONTEND_DIR  ?= frontend
BACKEND_TEST  ?= ./mvnw verify
FRONTEND_TEST ?= npx --no-install vitest run
NODE_RUN := $(abspath scripts/with-node.sh)

# Every Compose target needs a local .env file and a running Docker engine.
PREREQS := .env check-docker

.PHONY: format-java e2e invite lint install-hooks tooling-test quality sonar help start stop up down restart rebuild rebuild-clean logs ps db db-shell reset test check build frontend-install check-docker check-java smoke

help: ## Show this list
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

start: up ## Start the full development stack (same as make or make up)

stop: down ## Stop and remove containers, keeping database data (same as make down)

up: $(PREREQS) ## Build changed images and start the full development stack
	$(COMPOSE) up --detach --build --wait $(SERVICE)
	@$(COMPOSE) ps
	@if [ -z "$(SERVICE)" ] || [ "$(SERVICE)" = "frontend" ]; then \
	  address=$$($(COMPOSE) port frontend 5173); \
	  printf '\nRevue: http://%s\n' "$$address"; \
	fi

down: $(PREREQS) ## Stop and remove containers (keeps the database)
	$(COMPOSE) down --remove-orphans

restart: $(PREREQS) ## Restart containers without rebuilding (does not pick up code changes)
	$(COMPOSE) restart $(SERVICE)

rebuild: $(PREREQS) ## Rebuild images from current code and restart changed containers
	$(COMPOSE) up --detach --build --wait $(SERVICE)
	@$(COMPOSE) ps

rebuild-clean: $(PREREQS) ## Rebuild with no cache and fresh base images, then restart
	$(COMPOSE) build --no-cache --pull $(SERVICE)
	$(COMPOSE) up --detach --force-recreate --wait $(SERVICE)
	@$(COMPOSE) ps

logs: $(PREREQS) ## Follow logs, starting from the last 100 lines
	$(COMPOSE) logs --follow --tail=100 $(SERVICE)

ps: $(PREREQS) ## Show container status and ports
	$(COMPOSE) ps

db: $(PREREQS) ## Start only the database (for running the backend from your IDE)
	$(COMPOSE) up --detach --wait $(DB_SERVICE)

db-shell: $(PREREQS) ## Open psql inside the database container
	$(COMPOSE) exec $(DB_SERVICE) sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

reset: $(PREREQS) ## Delete containers AND the local database (asks first; CONFIRM=yes skips)
	@if [ "$(CONFIRM)" != "yes" ]; then \
	  read -r -p "This deletes all local data for this project. Type 'yes' to continue: " answer || answer=""; \
	  [ "$$answer" = "yes" ] || { echo "Cancelled. Nothing was deleted."; exit 1; }; \
	fi
	$(COMPOSE) down --volumes --remove-orphans

test: check-docker check-java frontend-install ## Install locked frontend packages and run backend and frontend tests
	@test -d "$(BACKEND_DIR)" || { echo "Missing $(BACKEND_DIR)/. Run make test from the repo root."; exit 1; }
	@test -d "$(FRONTEND_DIR)" || { echo "Missing $(FRONTEND_DIR)/. Run make test from the repo root."; exit 1; }
	cd "$(BACKEND_DIR)" && $(BACKEND_TEST)
	cd "$(FRONTEND_DIR)" && bash "$(NODE_RUN)" bash -c '$(FRONTEND_TEST)'

frontend-install: ## Install frontend packages with the pinned Node version
	cd "$(FRONTEND_DIR)" && bash "$(NODE_RUN)" npm ci

build: frontend-install ## Type-check and build the frontend for production
	cd "$(FRONTEND_DIR)" && bash "$(NODE_RUN)" npm run build

check: lint test build tooling-test ## Run lint, tests, type checking and the frontend production build

lint: frontend-install ## Lint frontend code and validate Python/shell tooling syntax
	cd "$(FRONTEND_DIR)" && bash "$(NODE_RUN)" npm run lint
	python3 -m py_compile scripts/*.py
	@for script in scripts/*.sh .githooks/pre-push; do bash -n "$$script"; done

format-java: check-java ## Apply the four-space, 120-column Java style to production and test Java
	cd "$(BACKEND_DIR)" && ./mvnw spotless:apply

invite: ## Create or replace the shared local pilot invitation; copy the link from stdout
	python3 scripts/issue-pilot-invite.py

install-hooks: ## Enable the local pre-push quality gate without replacing existing hooks
	@existing=$$(git config --get core.hooksPath || true); \
	  case "$$existing" in ""|.githooks) ;; *) echo "Existing hooksPath '$$existing' was preserved. Integrate the quality gate with it first."; exit 1;; esac; \
	  if [ -z "$$existing" ]; then \
	    for hook in "$$(git rev-parse --git-path hooks)"/*; do \
	      case "$$hook" in *.sample) continue;; esac; \
	      if [ -f "$$hook" ]; then \
	        echo "Existing hook '$$hook' was preserved. Integrate the quality gate with it first."; exit 1; \
	      fi; \
	    done; \
	  fi; \
	  git config --local core.hooksPath .githooks

tooling-test: ## Check that analysis cannot silently omit application code or tests
	python3 -m unittest discover -s scripts -p 'test_*.py'

quality: check e2e ## Run all checks, browser journeys and SonarQube (requires Docker)
	python3 scripts/check-sonar.py

e2e: check-docker frontend-install ## Test pilot account journeys against a disposable production app and database
	cd "$(FRONTEND_DIR)" && bash "$(NODE_RUN)" npx --no-install playwright install --only-shell chromium
	cd "$(FRONTEND_DIR)" && bash "$(NODE_RUN)" npm run test:e2e

sonar: check-docker check-java ## Analyze already compiled Java and installed frontend sources
	python3 scripts/check-sonar.py

smoke: up ## Check Vite and its proxy, and the production build served by the backend
	@frontend=$$($(COMPOSE) port frontend 5173); backend=$$($(COMPOSE) port backend 8080); \
	  bash scripts/check-local.sh "http://$$frontend" "http://$$backend"

# Create .env from the example only when .env is missing. An existing .env is never overwritten.
.env:
	@test -f .env.example || { echo "Missing .env.example. Add it to the repo first."; exit 1; }
	@[ -e .env ] || cp .env.example .env
	@echo "Created .env from .env.example. Edit it if you need different local values."

check-docker:
	@docker info >/dev/null 2>&1 || { echo "Docker is not reachable. Start Docker Desktop and turn on WSL integration for this distro."; exit 1; }
	@$(COMPOSE) version >/dev/null 2>&1 || { echo "Docker Compose is missing. Install Compose v2.20.2 or newer."; exit 1; }

check-java:
	@java_bin="$${JAVA_HOME:+$$JAVA_HOME/bin/}java"; \
	  version=$$("$$java_bin" -version 2>&1) || { echo "Java is unavailable. Install Temurin 25 and set JAVA_HOME."; exit 1; }; \
	  [[ "$$version" == *'version "25.'* ]] || { echo "Backend tests require Java 25. Check JAVA_HOME and PATH."; exit 1; }
