.PHONY: install run dev clean venv migrate migrate-create migrate-history migrate-stamp migrate-down migrate-reset

venv:
	python3 -m venv venv

install: venv
	./venv/bin/pip install -r requirements.txt

run:
	./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001

dev:
	./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

clean:
	rm -rf venv __pycache__ .pytest_cache

# =============================================================================
# Database Migrations (Alembic)
# =============================================================================

# Apply all pending migrations
migrate:
	./venv/bin/alembic upgrade head

# Create a new migration (usage: make migrate-create msg="add new column")
migrate-create:
	./venv/bin/alembic revision --autogenerate -m "$(msg)"

# Show migration history
migrate-history:
	./venv/bin/alembic history --verbose

# Show current migration version
migrate-current:
	./venv/bin/alembic current

# Mark existing database as up-to-date (for existing DBs)
migrate-stamp:
	./venv/bin/alembic stamp head

# Rollback one migration
migrate-down:
	./venv/bin/alembic downgrade -1

# Rollback all migrations
migrate-reset:
	./venv/bin/alembic downgrade base
