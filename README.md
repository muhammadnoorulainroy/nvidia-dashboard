# Nvidia Dashboard

A production-grade dashboard for the Nvidia project with analytics, time tracking integration, and client delivery management.

## Features

- Real-time statistics aggregation (domain, reviewer, trainer, POD lead levels)
- Jibble time tracking integration
- Client delivery workflow management
- Rating trends and comparison analysis
- Scheduled data synchronization from BigQuery

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 15+
- Google Cloud credentials for BigQuery

### Setup

1. **Clone and configure environment:**

```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Edit .env files with your configuration
# See "Environment Variables" section below
```

2. **Start with Make (recommended):**

```bash
# Install all dependencies
make install

# Run database migrations
make migrate

# Start both backend and frontend
make dev
```

Or manually:

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8001 --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## Project Structure

```
Dashboard_prod_nvidia/
├── .github/
│   └── workflows/           # CI/CD pipelines
│       ├── ci.yml          # Tests, linting, security scans
│       └── deploy.yml      # Deployment workflow
├── backend/
│   ├── alembic/            # Database migrations
│   │   ├── versions/       # Migration scripts
│   │   └── env.py          # Alembic configuration
│   ├── app/
│   │   ├── core/           # Core utilities
│   │   │   ├── async_utils.py   # Thread pool & signal handling
│   │   │   ├── cache.py         # Response caching
│   │   │   ├── exceptions.py    # Custom exceptions
│   │   │   ├── health.py        # Health check endpoints
│   │   │   ├── logging.py       # Structured logging
│   │   │   ├── metrics.py       # Prometheus metrics
│   │   │   ├── resilience.py    # Circuit breakers
│   │   │   └── sentry.py        # Error tracking
│   │   ├── models/
│   │   │   └── db_models.py     # SQLAlchemy models with FK constraints
│   │   ├── routers/
│   │   │   ├── stats.py         # Statistics API
│   │   │   └── jibble.py        # Jibble integration API
│   │   ├── schemas/
│   │   │   ├── request_schemas.py   # Input validation
│   │   │   └── response_schemas.py  # Response models
│   │   ├── services/
│   │   │   ├── db_service.py        # PostgreSQL operations
│   │   │   ├── data_sync_service.py # BigQuery sync
│   │   │   ├── query_service.py     # Data queries
│   │   │   └── jibble_service.py    # Jibble API client
│   │   ├── config.py        # Configuration management
│   │   └── main.py          # FastAPI application
│   ├── tests/               # Unit and integration tests
│   ├── requirements.txt     # Python dependencies
│   └── pytest.ini          # Test configuration
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── predelivery/ # Pre-delivery views
│   │   │   └── clientdelivery/ # Client delivery views
│   │   ├── pages/           # Page components
│   │   ├── services/        # API client
│   │   └── types/           # TypeScript types
│   ├── package.json
│   └── vite.config.ts
├── Makefile                 # Project automation
└── README.md
```

## API Reference

### Statistics Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/overall` | GET | Overall statistics |
| `/api/by-domain` | GET | Domain aggregation |
| `/api/by-trainer-level` | GET | Trainer statistics |
| `/api/by-trainer-daily` | GET | Trainer daily breakdown |
| `/api/by-reviewer` | GET | Reviewer statistics |
| `/api/by-reviewer-daily` | GET | Reviewer daily breakdown |
| `/api/by-pod-lead` | GET | POD lead aggregation |
| `/api/pod-lead-stats` | GET | POD lead with trainers |
| `/api/project-stats` | GET | Project-level statistics |
| `/api/task-level` | GET | Task-level data |
| `/api/rating-trends` | GET | Rating trends over time |
| `/api/rating-comparison` | GET | Period-over-period comparison |

### Operations Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync` | POST | Trigger manual data sync |
| `/api/sync-info` | GET | Last sync information |
| `/api/health` | GET | Database health check |

### Health & Monitoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API status |
| `/health` | GET | Liveness probe |
| `/health/ready` | GET | Readiness probe |
| `/health/full` | GET | Comprehensive health |
| `/metrics` | GET | Prometheus metrics |
| `/circuit-breakers` | GET | Circuit breaker status |
| `/cache/stats` | GET | Cache statistics |
| `/cache/clear` | POST | Clear cache |

## Environment Variables

### Backend Required Variables

```bash
# PostgreSQL (REQUIRED)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=nvidia

# BigQuery (REQUIRED)
GCP_PROJECT_ID=turing-gpt
BIGQUERY_DATASET=prod_labeling_tool_n
PROJECT_ID_FILTER=36
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# CORS (REQUIRED)
CORS_ORIGINS=http://localhost:3001

# Project (REQUIRED)
PROJECT_START_DATE=2025-09-26
```

### Backend Optional Variables

```bash
# Application
DEBUG=false
APP_NAME=Nvidia Dashboard API
APP_VERSION=1.0.0
HOST=0.0.0.0
PORT=8001

# Data Sync
SYNC_INTERVAL_HOURS=1
INITIAL_SYNC_ON_STARTUP=true

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=minute

# Jibble Integration
JIBBLE_API_KEY=your_key
JIBBLE_API_SECRET=your_secret
JIBBLE_PROJECT_NAME=Nvidia - SysBench

# Error Tracking (Sentry)
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ENVIRONMENT=development
```

### Frontend Variables

```bash
VITE_API_URL=http://localhost:8001
VITE_PORT=3001
```

## Database Migrations

This project uses Alembic for database migrations.

```bash
# Run migrations
make migrate

# Create new migration
make migrate-create msg="description"

# View migration history
make migrate-history

# Downgrade one version
make migrate-down
```

## Testing

```bash
# Run all tests
make test

# Run with coverage
make test-cov

# Run specific test file
cd backend && pytest tests/test_api_stats.py -v
```

## Development

### Code Quality

```bash
# Run linting
make lint

# Format code
make format
```

### Running Services

```bash
# Start backend only
make run-backend

# Start frontend only
make run-frontend

# Start both (development)
make dev
```

## Production Deployment

1. **Set production environment variables**
2. **Run migrations**: `make migrate`
3. **Build frontend**: `cd frontend && npm run build`
4. **Start with production server**:
   ```bash
   cd backend
   gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8001
   ```

### Docker (Optional)

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   BigQuery      │────>│  Data Sync      │────>│  PostgreSQL     │
│  (Source Data)  │     │   Service       │     │  (Local Cache)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        v
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │<────│   FastAPI       │<────│  Query Service  │
│   (React)       │     │   Backend       │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                v
                        ┌─────────────────┐
                        │   Jibble API    │
                        │ (Time Tracking) │
                        └─────────────────┘
```

## Monitoring

- **Health Checks**: `/health`, `/health/ready`, `/health/full`
- **Metrics**: Prometheus format at `/metrics`
- **Error Tracking**: Sentry integration (configure `SENTRY_DSN`)
- **Logging**: Structured JSON logging (production)

## Contributing

1. Create a feature branch
2. Make changes with tests
3. Ensure CI passes
4. Submit PR for review

## License

Internal use only - Turing
