.DEFAULT_GOAL := help

APP_PORT ?= 3000
APP_HOST ?= ::
TEST_ARGS ?=
SANDBOX_COMMANDS := environment install dev dev-force lint typecheck test e2e build clean
.PHONY: help $(SANDBOX_COMMANDS)

IN_DOCKER_SANDBOX := $(if $(and $(strip $(SANDBOX_NAME)),$(wildcard /etc/sandbox-persistent.sh)),true,false)

ENV_FILE := .env.dev
PNPM_CMD := corepack pnpm --config.confirmModulesPurge=false
SANDBOX_CACHE := $(abspath .runtime/.cache)
SANDBOX_ENV := CI=true XDG_CACHE_HOME="$(SANDBOX_CACHE)" NEXT_TELEMETRY_DISABLED=1 \
	COREPACK_ENABLE_DOWNLOAD_PROMPT=0 PNPM_DISABLE_SELF_UPDATE_CHECK=1

define run_pnpm
mkdir -p "$(SANDBOX_CACHE)" && env $(SANDBOX_ENV) $(PNPM_CMD) $(1)
endef

help:
	@printf '%s\n' 'Forman development in Docker Sandbox' '' 'Available commands:'
	@printf '%-23s %s\n' \
		'  make environment' 'Install the toolchain and prepare .env.dev and /data' \
		'  make install' 'Install pnpm dependencies' \
		'  make dev' 'Start the Next.js development server' \
		'  make dev-force' 'Restart the running Next.js development server' \
		'  make lint' 'Run ESLint' \
		'  make typecheck' 'Run TypeScript type checks' \
		'  make test' 'Run unit and integration tests' \
		'  make e2e' 'Run Playwright end-to-end tests' \
		'  make build' 'Create a production build' \
		'  make clean' 'Remove local generated artifacts'

ifeq ($(IN_DOCKER_SANDBOX),true)

export PATH := $(HOME)/.local/bin:$(PATH)

environment:
	sudo apt-get update
	sudo apt-get install -y --no-install-recommends nodejs-24 npm curl nano
	npm install --global --prefix "$(HOME)/.local" corepack@0.36.0
	@test -d /data || sudo install -d -m 0700 -o "$$(id -u)" -g "$$(id -g)" /data
	@if [ ! -e "$(ENV_FILE)" ]; then \
		install -m 0600 .env.dev.example "$(ENV_FILE)" && \
		printf 'Created %s from .env.dev.example.\n' "$(ENV_FILE)"; \
	fi

install:
	@printf '%s\n' 'Installing pnpm dependencies…'
	@$(call run_pnpm,install --no-frozen-lockfile)

dev:
	@if [ -f "$(ENV_FILE)" ]; then set -a; . "./$(ENV_FILE)"; set +a; fi; \
	if [ "$${FORMAN_DEBUG:-false}" != "true" ] && ! node -e 'const server = require("node:net").createServer(); server.once("error", (error) => process.exit(error.code === "EADDRINUSE" ? 2 : 1)); server.listen({ host: process.argv[2], port: Number(process.argv[1]) }, () => server.close(() => process.exit(0)));' "$(APP_PORT)" "$(APP_HOST)"; then \
		printf '%s\n' 'Starting the Next.js development server…'; \
		printf '%s\n' '$$ next dev --hostname $(APP_HOST) --port $(APP_PORT)'; \
		printf '%s\n' '⨯ Failed to start server' "Error: listen EADDRINUSE: address already in use [$(APP_HOST)]:$(APP_PORT)"; \
		exit 0; \
	fi; \
	printf '%s\n' 'Starting the Next.js development server…'; \
	$(call run_pnpm,dev --hostname $(APP_HOST) --port $(APP_PORT))

dev-force:
	@port="$(APP_PORT)"; \
	case "$$port" in ''|*[!0-9]*) printf '%s\n' "APP_PORT must be a number: $$port"; exit 1 ;; esac; \
	if [ "$$port" -lt 1 ] || [ "$$port" -gt 65535 ]; then printf '%s\n' "APP_PORT must be between 1 and 65535: $$port"; exit 1; fi; \
	listener_pids() { \
		port_hex=$$(printf '%04X' "$$port"); \
		inodes=$$(awk -v suffix=":$$port_hex" '$$4 == "0A" && substr($$2, length($$2) - length(suffix) + 1) == suffix { print $$10 }' /proc/net/tcp /proc/net/tcp6); \
		for inode in $$inodes; do \
			for process_path in /proc/[0-9]*; do \
				for fd in "$$process_path"/fd/*; do \
					test "$$(readlink "$$fd" 2>/dev/null)" = "socket:[$$inode]" || continue; \
					printf '%s\n' "$${process_path##*/}"; \
				done; \
			done; \
		done | sort -u; \
	}; \
	is_next_listener() { \
		candidate="$$1"; \
		while [ -n "$$candidate" ] && [ "$$candidate" -gt 1 ]; do \
			command=$$(tr '\000' ' ' < "/proc/$$candidate/cmdline" 2>/dev/null || true); \
			case "$$command" in *"next dev"*|*"next-server"*) return 0 ;; esac; \
			parent=$$(awk '/^PPid:/{print $$2}' "/proc/$$candidate/status" 2>/dev/null || true); \
			if [ -z "$$parent" ] || [ "$$parent" = 0 ]; then break; fi; \
			candidate="$$parent"; \
		done; \
		return 1; \
	}; \
	pids="$$(listener_pids)"; \
	if [ -n "$$pids" ]; then \
		printf '%s\n' "Stopping the process listening on port $$port…"; \
		for pid in $$pids; do \
			if ! is_next_listener "$$pid"; then printf '%s\n' "Port $$port is not served by a Next.js development server."; exit 1; fi; \
		done; \
		for pid in $$pids; do kill -TERM "$$pid" 2>/dev/null || true; done; \
		attempt=0; \
		while [ "$$attempt" -lt 20 ] && [ -n "$$(listener_pids)" ]; do sleep 1; attempt=$$((attempt + 1)); done; \
		remaining="$$(listener_pids)"; \
		if [ -n "$$remaining" ]; then \
			printf '%s\n' "Force-stopping the process listening on port $$port…"; \
		for pid in $$remaining; do kill -KILL "$$pid" 2>/dev/null || true; done; \
		fi; \
	fi; \
	if [ -n "$$(listener_pids)" ]; then printf '%s\n' "Port $$port is still in use."; exit 1; fi; \
	$(MAKE) --no-print-directory dev APP_PORT="$$port" FORMAN_DEBUG=true

lint:
	@$(call run_pnpm,lint)

typecheck:
	@$(call run_pnpm,typecheck)

test:
	@$(call run_pnpm,test $(TEST_ARGS))

e2e:
	@$(call run_pnpm,exec playwright install chromium)
	@$(call run_pnpm,e2e)

build:
	@$(call run_pnpm,build)

clean:
	@rm -rf node_modules .next .runtime .pnpm-store coverage playwright-report test-results tsconfig.tsbuildinfo

else

$(SANDBOX_COMMANDS):
	@printf '%s\n' 'This command must be run inside Docker Sandbox.'
	@exit 1

endif
