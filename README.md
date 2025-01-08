# Nvidia Dashboard

A dedicated dashboard for the Nvidia project with its own backend and frontend.

## Configuration

- **BigQuery Dataset**: `prod_labeling_tool_n`
- **Project ID**: 39
- **PostgreSQL Database**: `nvidia`
- **Backend Port**: 8001
- **Frontend Port**: 3001

## Project Structure

```
Dashboard_prod_nvidia/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI application entry point
│   │   ├── core/                # Core infrastructure modules
│   │   │   ├── config.py        # Application configuration
│   │   │   ├── logging.py       # Structured logging
│   │   │   ├── metrics.py       # Prometheus metrics
│   │   │   ├── resilience.py    # Circuit breakers & retry logic
│   │   │   ├── health.py        # Health check endpoints
│   │   │   ├── cache.py         # Query result caching
│   │   │   ├── async_utils.py   # Async/sync utilities
│   │   │   └── exceptions.py    # Custom exception classes
│   │   ├── models/
│   │   │   └── db_models.py     # SQLAlchemy models
│   │   ├── routers/
│   │   │   └── stats.py         # API endpoints
│   │   ├── schemas/
│   │   │   └── response_schemas.py
│   │   └── services/
│   │       ├── db_service.py        # PostgreSQL connection
│   │       ├── data_sync_service.py # BigQuery to PostgreSQL sync
│   │       └── query_service.py     # Data query operations
│   ├── alembic/                 # Database migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── theme.ts
│   │   ├── components/
│   │   │   └── Layout.tsx
│   │   ├── pages/
│   │   │   └── Dashboard.tsx
│   │   └── services/
│   │       └── api.ts
│   ├── package.json
│   └── vite.config.ts
├── Makefile                     # Unix/Mac automation (see Windows commands below)
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL
- Google Cloud credentials for BigQuery

### Backend Setup

**Unix/Mac:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Edit .env with your values
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Windows (PowerShell):**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # Edit .env with your values
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

> **IMPORTANT**: The application will NOT start without proper configuration.
> All database credentials and BigQuery settings must be set in the `.env` file.
> See `.env.example` for required variables.

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

## API Endpoints

All endpoints are prefixed with `/api`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/overall` | GET | Get overall statistics |
| `/api/by-domain` | GET | Get domain-wise statistics |
| `/api/by-trainer-level` | GET | Get trainer-wise statistics |
| `/api/by-reviewer` | GET | Get reviewer-wise statistics |
| `/api/task-level` | GET | Get task-level data |
| `/api/sync` | POST | Trigger manual data sync |
| `/api/health` | GET | Check database health |
| `/api/sync-info` | GET | Get last sync information |

## Environment Variables

### Required Variables

These variables **MUST** be set in your `.env` file:

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password (cannot be common defaults) |
| `POSTGRES_DB` | PostgreSQL database name |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `BIGQUERY_DATASET` | BigQuery dataset name |
| `PROJECT_ID_FILTER` | Project ID filter for queries |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | localhost | PostgreSQL host |
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `DEBUG` | false | Enable debug mode (enables API docs) |
| `CORS_ORIGINS` | http://localhost:3001 | Comma-separated allowed origins |
| `GOOGLE_APPLICATION_CREDENTIALS` | - | Path to GCP service account JSON |
| `SYNC_INTERVAL_HOURS` | 1 | Data sync interval in hours |
| `RATE_LIMIT_ENABLED` | true | Enable/disable rate limiting |
| `RATE_LIMIT_REQUESTS` | 100 | Requests allowed per window |
| `RATE_LIMIT_WINDOW` | minute | Rate limit window (second/minute/hour) |
| `JIBBLE_API_KEY` | - | Jibble API client ID |
| `JIBBLE_API_SECRET` | - | Jibble API client secret |

> **Security Note**: Never use common passwords like 'postgres', 'password', 'admin', etc.
> The application will refuse to start with insecure default credentials.

## Database Migrations

Database schema changes are managed using Alembic:

```bash
cd backend

# Generate a new migration after model changes
alembic revision --autogenerate -m "description of changes"

# Apply all pending migrations
alembic upgrade head

# View current migration status
alembic current

# Rollback one migration
alembic downgrade -1
```

## Health Check Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Simple liveness check (Kubernetes liveness probe) |
| `/health/ready` | Readiness check - returns 503 if dependencies unavailable |
| `/health/full` | Comprehensive health check with all component status |

## Metrics & Monitoring

| Endpoint | Description |
|----------|-------------|
| `/metrics` | Prometheus metrics (request count, latency, errors) |
| `/circuit-breakers` | Circuit breaker status for all services |

### Available Metrics

- `http_requests_total` - Total HTTP requests by method, endpoint, status
- `http_request_duration_seconds` - Request latency histogram
- `db_operations_total` - Database operations by type and table
- `sync_operations_total` - Data sync operations by type and status
- `circuit_breaker_state` - Circuit breaker states (0=closed, 1=half_open, 2=open)

## Resilience Features

The application includes several resilience patterns:

### Circuit Breakers
Protects against cascading failures by failing fast when services are unavailable:
- **postgresql** - Database operations (threshold: 3 failures, recovery: 30s)
- **bigquery** - BigQuery sync operations (threshold: 3 failures, recovery: 60s)
- **jibble** - Jibble API calls (threshold: 5 failures, recovery: 120s)

### Graceful Startup
- Critical failures (database) prevent startup
- Non-critical failures (BigQuery, Jibble) allow degraded mode
- Application continues running and recovers when services become available

### Retry Logic
- Exponential backoff for transient failures
- Configurable retry attempts and wait times

## Data Flow

1. **BigQuery** (`prod_labeling_tool_n`) → Contains raw project data
2. **Data Sync Service** → Extracts and transforms data using CTEs
3. **PostgreSQL** (`nvidia`) → Stores synced data for fast querying
4. **Query Service** → Provides aggregated statistics
5. **API Endpoints** → Expose data to frontend
6. **Dashboard** → Visualizes data

## Automatic Data Sync

The application automatically syncs data from BigQuery to PostgreSQL:
- On startup (if database is empty)
- Every hour (configurable via `SYNC_INTERVAL_HOURS`)
- Manual sync via POST `/api/sync`

## Makefile (Unix/Mac only)

The root `Makefile` provides convenient commands for Unix/Mac:

```bash
make start      # Start both backend and frontend
make stop       # Stop all services
make backend    # Start backend only
make frontend   # Start frontend only
make install    # Install all dependencies
make sync       # Trigger data sync
make status     # Check service status
make help       # Show all commands
```

> **Note**: The Makefile uses Unix-specific commands (`pkill`, `lsof`) and won't work on Windows.
> Windows users should use the PowerShell commands in the setup sections above.
