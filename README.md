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
│   │   ├── config.py         # Application configuration
│   │   ├── main.py           # FastAPI application
│   │   ├── models/
│   │   │   └── db_models.py  # SQLAlchemy models
│   │   ├── routers/
│   │   │   └── stats.py      # API endpoints
│   │   ├── schemas/
│   │   │   └── response_schemas.py
│   │   └── services/
│   │       ├── db_service.py        # PostgreSQL connection
│   │       ├── data_sync_service.py # BigQuery to PostgreSQL sync
│   │       └── query_service.py     # Data query operations
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
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL
- Google Cloud credentials for BigQuery

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables (optional - uses defaults)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Run the server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

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

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | localhost | PostgreSQL host |
| `POSTGRES_PORT` | 5432 | PostgreSQL port |
| `POSTGRES_USER` | postgres | PostgreSQL user |
| `POSTGRES_PASSWORD` | postgres | PostgreSQL password |
| `POSTGRES_DB` | nvidia | PostgreSQL database name |
| `GOOGLE_APPLICATION_CREDENTIALS` | - | Path to GCP credentials |
| `SYNC_INTERVAL_HOURS` | 1 | Data sync interval |

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
