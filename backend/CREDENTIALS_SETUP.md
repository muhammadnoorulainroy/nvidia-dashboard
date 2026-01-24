# BigQuery Credentials Setup for Nvidia Dashboard

## Required Environment Variables

Add these to your `.env` file:

```bash
# ====================================
# BIGQUERY CONFIGURATION
# ====================================

# GCP Project ID
GCP_PROJECT_ID=turing-gpt

# BigQuery Dataset
BIGQUERY_DATASET=prod_labeling_tool_n

# Tables used
CONVERSATION_TABLE=conversation
REVIEW_TABLE=review

# Project ID Filter (Nvidia = 36)
PROJECT_ID_FILTER=36

# ====================================
# AUTHENTICATION OPTIONS
# ====================================

# Option 1: Service Account JSON (Recommended for production)
# Uncomment and set the path to your service account JSON file
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/turing-gpt-service-account.json

# Option 2: Application Default Credentials (For development)
# Run: gcloud auth application-default login
# No env variable needed - uses default credentials
```

## Authentication Methods

### Method 1: Application Default Credentials (ADC) - Development

```bash
# Login to Google Cloud
gcloud auth login

# Set application default credentials
gcloud auth application-default login

# Set the project
gcloud config set project turing-gpt

# Verify
gcloud config get project
```

### Method 2: Service Account JSON - Production

1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Select project: `turing-gpt`
3. Navigate to: IAM & Admin → Service Accounts
4. Create or select a service account
5. Create a new key (JSON format)
6. Download and save the JSON file
7. Set in `.env`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/your-key.json
   ```

## Required IAM Roles

The service account or user needs these roles on `turing-gpt`:

| Role | Purpose |
|------|---------|
| `roles/bigquery.dataViewer` | Read BigQuery tables |
| `roles/bigquery.jobUser` | Execute BigQuery queries |

## BigQuery Tables Used

| Table | Purpose |
|-------|---------|
| `turing-gpt.prod_labeling_tool_n.conversation` | Task data |
| `turing-gpt.prod_labeling_tool_n.conversation_status_history` | Task history |
| `turing-gpt.prod_labeling_tool_n.review` | Review data |
| `turing-gpt.prod_labeling_tool_n.contributor` | User data |
| `turing-gpt.prod_labeling_tool_n.batch` | Batch data |
| `turing-gpt.prod_labeling_tool_n.delivery_batch` | Delivery data |
| `turing-gpt.prod_labeling_tool_n.delivery_batch_task` | Delivery task mapping |

## Verify Setup

```bash
# Test BigQuery access
bq query --project_id=turing-gpt "SELECT COUNT(*) FROM prod_labeling_tool_n.conversation WHERE project_id = 36"
```

## PostgreSQL Configuration

Also ensure these are set in `.env`:

```bash
# PostgreSQL Settings
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=nvidia
```
