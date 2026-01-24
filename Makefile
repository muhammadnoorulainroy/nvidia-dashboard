# Nvidia Dashboard Makefile
# Ports Configuration
BACKEND_PORT := 8001
FRONTEND_PORT := 3001

# Paths
BACKEND_DIR := backend
FRONTEND_DIR := frontend
VENV := $(BACKEND_DIR)/venv/bin

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: all start stop restart clean backend frontend install sync help

# Default target
all: start

# ============================================
# MAIN COMMANDS
# ============================================

## Start both backend and frontend (clears existing processes first)
start: stop
	@echo "$(GREEN)Starting Nvidia Dashboard...$(NC)"
	@$(MAKE) backend-start
	@sleep 5
	@$(MAKE) frontend-start
	@echo ""
	@echo "$(GREEN)✓ Dashboard is running!$(NC)"
	@echo "  Backend:  http://localhost:$(BACKEND_PORT)"
	@echo "  Frontend: http://localhost:$(FRONTEND_PORT)"
	@echo "  API Docs: http://localhost:$(BACKEND_PORT)/docs"
	@echo ""

## Stop all running services
stop:
	@echo "$(YELLOW)Stopping existing services...$(NC)"
	@-pkill -f "uvicorn.*$(BACKEND_PORT)" 2>/dev/null || true
	@-pkill -f "node.*$(FRONTEND_PORT)" 2>/dev/null || true
	@-pkill -f "vite.*$(FRONTEND_PORT)" 2>/dev/null || true
	@-lsof -ti:$(BACKEND_PORT) | xargs kill -9 2>/dev/null || true
	@-lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || true
	@sleep 2
	@echo "$(GREEN)✓ Services stopped$(NC)"

## Restart all services
restart: stop start

## Fresh start - clears cache and restarts
fresh: stop clean-cache start

# ============================================
# INDIVIDUAL SERVICE COMMANDS
# ============================================

## Start backend only
backend: stop-backend backend-start

## Start frontend only  
frontend: stop-frontend frontend-start

## Stop backend only
stop-backend:
	@echo "$(YELLOW)Stopping backend...$(NC)"
	@-pkill -f "uvicorn.*$(BACKEND_PORT)" 2>/dev/null || true
	@-lsof -ti:$(BACKEND_PORT) | xargs kill -9 2>/dev/null || true
	@sleep 1

## Stop frontend only
stop-frontend:
	@echo "$(YELLOW)Stopping frontend...$(NC)"
	@-pkill -f "node.*$(FRONTEND_PORT)" 2>/dev/null || true
	@-pkill -f "vite.*$(FRONTEND_PORT)" 2>/dev/null || true
	@-lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || true
	@sleep 1

# Internal targets
backend-start:
	@echo "$(GREEN)Starting backend on port $(BACKEND_PORT)...$(NC)"
	@cd $(BACKEND_DIR) && ./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port $(BACKEND_PORT) --reload &
	@echo "$(GREEN)✓ Backend started$(NC)"

frontend-start:
	@echo "$(GREEN)Starting frontend on port $(FRONTEND_PORT)...$(NC)"
	@cd $(FRONTEND_DIR) && npm run dev -- --port $(FRONTEND_PORT) &
	@echo "$(GREEN)✓ Frontend started$(NC)"

# ============================================
# INSTALLATION & SETUP
# ============================================

## Install all dependencies
install: install-backend install-frontend
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

## Install backend dependencies
install-backend:
	@echo "$(YELLOW)Installing backend dependencies...$(NC)"
	@cd $(BACKEND_DIR) && \
		python3 -m venv venv && \
		$(VENV)/pip install --upgrade pip && \
		$(VENV)/pip install -r requirements.txt
	@echo "$(GREEN)✓ Backend dependencies installed$(NC)"

## Install frontend dependencies
install-frontend:
	@echo "$(YELLOW)Installing frontend dependencies...$(NC)"
	@cd $(FRONTEND_DIR) && npm install
	@echo "$(GREEN)✓ Frontend dependencies installed$(NC)"

# ============================================
# DATA SYNC
# ============================================

## Trigger data sync from BigQuery
sync:
	@echo "$(YELLOW)Triggering data sync...$(NC)"
	@curl -s -X POST "http://localhost:$(BACKEND_PORT)/api/sync" | python3 -m json.tool
	@echo "$(GREEN)✓ Sync completed$(NC)"

# ============================================
# CACHE & CLEANUP
# ============================================

## Clear Python cache
clean-cache:
	@echo "$(YELLOW)Clearing cache...$(NC)"
	@find $(BACKEND_DIR) -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find $(BACKEND_DIR) -type f -name "*.pyc" -delete 2>/dev/null || true
	@rm -rf $(FRONTEND_DIR)/node_modules/.vite 2>/dev/null || true
	@echo "$(GREEN)✓ Cache cleared$(NC)"

## Clean all generated files
clean: stop clean-cache
	@echo "$(YELLOW)Cleaning generated files...$(NC)"
	@rm -rf $(BACKEND_DIR)/venv 2>/dev/null || true
	@rm -rf $(FRONTEND_DIR)/node_modules 2>/dev/null || true
	@echo "$(GREEN)✓ Cleaned$(NC)"

# ============================================
# STATUS & LOGS
# ============================================

## Check status of services
status:
	@echo "$(YELLOW)Service Status:$(NC)"
	@echo ""
	@echo "Backend (port $(BACKEND_PORT)):"
	@-lsof -i:$(BACKEND_PORT) | head -3 || echo "  Not running"
	@echo ""
	@echo "Frontend (port $(FRONTEND_PORT)):"
	@-lsof -i:$(FRONTEND_PORT) | head -3 || echo "  Not running"

## Test backend API
test-api:
	@echo "$(YELLOW)Testing Backend API...$(NC)"
	@curl -s "http://localhost:$(BACKEND_PORT)/api/by-trainer-daily" | python3 -c "\
import json, sys; \
data = json.load(sys.stdin); \
print(f'Trainer Daily Stats: {len(data)} records') if isinstance(data, list) else print('Error:', data)"
	@curl -s "http://localhost:$(BACKEND_PORT)/api/by-reviewer-daily" | python3 -c "\
import json, sys; \
data = json.load(sys.stdin); \
print(f'Reviewer Daily Stats: {len(data)} records') if isinstance(data, list) else print('Error:', data)"

# ============================================
# HELP
# ============================================

## Show this help
help:
	@echo ""
	@echo "$(GREEN)Nvidia Dashboard - Available Commands$(NC)"
	@echo "========================================"
	@echo ""
	@echo "$(YELLOW)Main Commands:$(NC)"
	@echo "  make start      - Start both backend and frontend (clears existing first)"
	@echo "  make stop       - Stop all running services"
	@echo "  make restart    - Restart all services"
	@echo "  make fresh      - Clear cache and restart (fresh start)"
	@echo ""
	@echo "$(YELLOW)Individual Services:$(NC)"
	@echo "  make backend    - Start backend only"
	@echo "  make frontend   - Start frontend only"
	@echo ""
	@echo "$(YELLOW)Installation:$(NC)"
	@echo "  make install    - Install all dependencies"
	@echo ""
	@echo "$(YELLOW)Data:$(NC)"
	@echo "  make sync       - Trigger data sync from BigQuery"
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@echo "  make status     - Check service status"
	@echo "  make test-api   - Test backend API endpoints"
	@echo "  make clean      - Remove all generated files"
	@echo "  make help       - Show this help"
	@echo ""
	@echo "$(YELLOW)Ports:$(NC)"
	@echo "  Backend:  $(BACKEND_PORT)"
	@echo "  Frontend: $(FRONTEND_PORT)"
	@echo ""
