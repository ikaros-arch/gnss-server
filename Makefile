.PHONY: help dev test replay build prod pull logs stop restart ps

COMPOSE      = docker compose
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-12s %s\n", $$1, $$2}'

# ── local development (no Docker) ────────────────────────────────────────────

dev: ## Start dev server with live reload (tsx watch)
	npm run dev

test: ## Run unit tests (vitest)
	npm test

replay: ## Replay sample NMEA at the local listener (127.0.0.1:9100)
	npm run replay

# ── Docker ───────────────────────────────────────────────────────────────────

build: ## Build image and start with standard compose file
	$(COMPOSE) up --build -d

prod: ## Build image and start with production overlay (limits + log rotation)
	$(COMPOSE_PROD) up --build -d

pull: ## Pull latest code from git, rebuild, and restart production
	git pull
	$(MAKE) prod

logs: ## Follow container logs (Ctrl-C to stop)
	$(COMPOSE) logs -f gnss-server

stop: ## Stop and remove containers
	$(COMPOSE) down

restart: ## Restart the running container without rebuilding
	$(COMPOSE) restart gnss-server

ps: ## Show container status
	$(COMPOSE) ps
