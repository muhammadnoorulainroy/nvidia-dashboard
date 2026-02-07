# BigQuery Service Analysis

**File:** `backend/app/services/bigquery_service.py`  
**Date:** February 5, 2026

## Executive Summary

The `BigQueryService` class provides a service layer for querying BigQuery datasets to retrieve review and quality dimension statistics. The service uses a singleton pattern and provides aggregation methods for domain, reviewer, trainer, and overall statistics. However, **the service lacks comprehensive error handling** and has several potential security and reliability issues.

---

## 1. BigQuery Client Initialization

### Current Implementation

```python
def _create_client(self) -> bigquery.Client:
    """Create and return BigQuery client with credentials"""
    credentials_path = self.settings.google_application_credentials
    
    if credentials_path and os.path.exists(credentials_path):
        credentials = service_account.Credentials.from_service_account_file(
            credentials_path
        )
        return bigquery.Client(
            credentials=credentials,
            project=self.settings.gcp_project_id
        )
    else:
        # Use default credentials (useful for GCP environments)
        return bigquery.Client(project=self.settings.gcp_project_id)
```

### Analysis

**Strengths:**
- Supports both service account file and default credentials
- Falls back gracefully to default credentials if file not found
- Uses project ID from settings

**Issues:**

1. **No Error Handling**: Client creation can fail due to:
   - Invalid credentials file format
   - Missing permissions
   - Network issues
   - Invalid project ID
   - **No try-except block** - exceptions propagate to `__init__`

2. **No Validation**: 
   - Doesn't verify credentials are valid before returning client
   - Doesn't check if project ID exists or is accessible

3. **Silent Fallback**: 
   - Falls back to default credentials without logging
   - May mask configuration issues

4. **Initialization Timing**: 
   - Client created during `__init__` - failures occur at import time
   - No lazy initialization option

### Recommendations

```python
def _create_client(self) -> bigquery.Client:
    """Create and return BigQuery client with credentials"""
    import logging
    logger = logging.getLogger(__name__)
    
    credentials_path = self.settings.google_application_credentials
    
    try:
        if credentials_path and os.path.exists(credentials_path):
            credentials = service_account.Credentials.from_service_account_file(
                credentials_path
            )
            logger.info(f"Using service account credentials from {credentials_path}")
            client = bigquery.Client(
                credentials=credentials,
                project=self.settings.gcp_project_id
            )
        else:
            logger.info("Using default application credentials")
            client = bigquery.Client(project=self.settings.gcp_project_id)
        
        # Verify client can access project
        client.get_dataset(self.settings.bigquery_dataset)
        logger.info(f"BigQuery client initialized for project {self.settings.gcp_project_id}")
        return client
        
    except FileNotFoundError:
        logger.error(f"Credentials file not found: {credentials_path}")
        raise
    except Exception as e:
        logger.error(f"Failed to initialize BigQuery client: {e}")
        raise
```

---

## 2. Query Methods

### Available Methods

1. `get_domain_aggregation(filters)` - Aggregates by domain
2. `get_reviewer_aggregation(filters)` - Aggregates by reviewer with names
3. `get_trainer_level_aggregation(filters)` - Aggregates by trainer level
4. `get_task_level_info(filters)` - Task-level details
5. `get_overall_aggregation(filters)` - Overall statistics

### Query Pattern Analysis

All methods follow this pattern:
1. Build base CTE query (`_build_review_detail_query`)
2. Append SELECT statement
3. Execute query synchronously
4. Process results with specialized processors

### Issues

#### 2.1 Synchronous Query Execution

**Problem:**
```python
query_job = self.client.query(query)
results = [dict(row) for row in query_job.result()]
```

- Methods are marked `async` but execute queries **synchronously**
- `query_job.result()` blocks until completion
- No timeout configuration
- Can block event loop in async contexts

**Impact:**
- Poor performance in async FastAPI endpoints
- No cancellation support
- Risk of hanging requests

**Recommendation:**
```python
async def get_domain_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Get aggregated statistics by domain"""
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    
    base_query = self._build_review_detail_query(filters)
    query = base_query + """
    SELECT DISTINCT
        domain,
        name,
        conversation_id,
        score_text,
        score
    FROM review_detail
    WHERE name IS NOT NULL
    """
    
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor() as executor:
        query_job = await loop.run_in_executor(
            executor, 
            lambda: self.client.query(query, job_config=bigquery.QueryJobConfig(
                use_legacy_sql=False,
                job_timeout_ms=300000  # 5 minute timeout
            ))
        )
        results = await loop.run_in_executor(
            executor,
            lambda: [dict(row) for row in query_job.result()]
        )
    
    return self._process_aggregation_results(results, 'domain')
```

#### 2.2 No Query Timeout

- Queries can run indefinitely
- No `job_timeout_ms` configuration
- Risk of resource exhaustion

#### 2.3 No Query Validation

- SQL is built via string concatenation
- No validation before execution
- Risk of SQL injection (though mitigated by parameterized filters)

#### 2.4 No Query Caching

- Same queries executed repeatedly
- No result caching mechanism
- Increased BigQuery costs

---

## 3. Dataset/Table References

### Current References

All queries reference tables in format:
```sql
`turing-gpt.{self.settings.bigquery_dataset}.table_name`
```

or

```sql
`{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.table_name`
```

### Tables Used

1. `conversation` - Main conversation/task table
2. `review` - Review records
3. `batch` - Batch information
4. `delivery_batch_task` - Delivery tracking
5. `contributor` - Contributor/user information
6. `conversation_status_history` - Status change history
7. `review_quality_dimension_value` - Quality dimension scores
8. `quality_dimension` - Quality dimension definitions

### Issues

#### 3.1 Inconsistent Project ID Usage

**Problem:**
- Some queries use hardcoded `turing-gpt`
- Others use `self.settings.gcp_project_id`
- Inconsistent pattern creates maintenance issues

**Example:**
```python
# Line 103: Hardcoded project
FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history`

# Line 142: Uses settings
FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation`
```

**Recommendation:** Standardize on `self.settings.gcp_project_id` everywhere.

#### 3.2 No Table Existence Validation

- No checks if tables exist before querying
- Errors only discovered at runtime
- No graceful degradation

#### 3.3 Hardcoded Project ID

- `turing-gpt` hardcoded in multiple places
- Should use `self.settings.gcp_project_id` consistently

---

## 4. Error Handling

### Current State: **CRITICAL ISSUE**

**The service has NO error handling for BigQuery operations.**

### Missing Error Handling

1. **Client Initialization Errors**
   - No try-except in `_create_client()`
   - Exceptions propagate to `__init__`
   - No graceful failure

2. **Query Execution Errors**
   - No try-except around `client.query()`
   - No handling for:
     - `google.cloud.exceptions.NotFound` - Table/dataset not found
     - `google.cloud.exceptions.Forbidden` - Permission denied
     - `google.cloud.exceptions.BadRequest` - Invalid query
     - `google.api_core.exceptions.GoogleAPIError` - General API errors
     - Network timeouts
     - Quota exceeded errors

3. **Result Processing Errors**
   - No handling for malformed results
   - No validation of result structure
   - Assumes all fields exist

4. **Filter Building Errors**
   - No SQL injection protection for filter values
   - String interpolation without sanitization

### Example Error Scenarios

```python
# Scenario 1: Table doesn't exist
# Current: Raises NotFound exception, crashes endpoint
# Should: Return empty result or error response

# Scenario 2: Permission denied
# Current: Raises Forbidden exception, crashes endpoint  
# Should: Log error, return appropriate HTTP status

# Scenario 3: Invalid query syntax
# Current: Raises BadRequest exception, crashes endpoint
# Should: Validate query, return validation error

# Scenario 4: Quota exceeded
# Current: Raises exception, crashes endpoint
# Should: Return rate limit error, implement retry logic
```

### Recommended Error Handling

```python
from google.cloud.exceptions import NotFound, Forbidden, BadRequest
from google.api_core import exceptions as google_exceptions
import logging

logger = logging.getLogger(__name__)

async def get_domain_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Get aggregated statistics by domain"""
    try:
        base_query = self._build_review_detail_query(filters)
        query = base_query + """
        SELECT DISTINCT
            domain,
            name,
            conversation_id,
            score_text,
            score
        FROM review_detail
        WHERE name IS NOT NULL
        """
        
        query_job = self.client.query(query)
        results = [dict(row) for row in query_job.result()]
        
        return self._process_aggregation_results(results, 'domain')
        
    except NotFound as e:
        logger.error(f"BigQuery table/dataset not found: {e}")
        raise AppException(
            error="Dataset or table not found",
            code=ErrorCode.BIGQUERY_ERROR,
            detail=str(e)
        )
    except Forbidden as e:
        logger.error(f"BigQuery permission denied: {e}")
        raise AppException(
            error="Permission denied accessing BigQuery",
            code=ErrorCode.BIGQUERY_ERROR,
            detail="Insufficient permissions"
        )
    except BadRequest as e:
        logger.error(f"Invalid BigQuery query: {e}")
        raise AppException(
            error="Invalid query",
            code=ErrorCode.VALIDATION_ERROR,
            detail=str(e)
        )
    except google_exceptions.GoogleAPIError as e:
        logger.error(f"BigQuery API error: {e}")
        raise AppException(
            error="BigQuery service error",
            code=ErrorCode.BIGQUERY_ERROR,
            detail=str(e) if self.settings.debug else None
        )
    except Exception as e:
        logger.error(f"Unexpected error in get_domain_aggregation: {e}", exc_info=True)
        raise AppException(
            error="Failed to retrieve domain statistics",
            code=ErrorCode.INTERNAL_ERROR,
            detail=str(e) if self.settings.debug else None
        )
```

---

## 5. Query Patterns

### Base Query Structure

All queries use a complex CTE structure:

1. **task_reviewed_info** - Filters reviewed tasks
2. **task** - Extracts domain from task statements
3. **review** - Gets latest published manual reviews
4. **review_detail** - Joins everything together

### Query Complexity

- **High complexity**: Multiple CTEs, subqueries, joins
- **Performance concerns**: No indexes mentioned, complex regex operations
- **Maintainability**: Long queries, hard to debug

### Filter Building

```python
def _build_filter_clauses(self, filters: Optional[Dict[str, Any]] = None) -> str:
    """Build WHERE clause conditions from filters"""
    # ...
    if filters.get('domain'):
        conditions.append(f"domain = '{filters['domain']}'")
```

### Issues

#### 5.1 SQL Injection Risk

**Problem:**
- Direct string interpolation in SQL
- Filter values not sanitized
- Special characters not escaped

**Example Vulnerability:**
```python
filters = {'domain': "'; DROP TABLE review_detail; --"}
# Results in: domain = ''; DROP TABLE review_detail; --'
```

**Recommendation:**
```python
def _build_filter_clauses(self, filters: Optional[Dict[str, Any]] = None) -> str:
    """Build WHERE clause conditions from filters"""
    if not filters:
        return ""
    
    conditions = []
    
    # Use parameterized queries or escape values
    if filters.get('domain'):
        # Escape single quotes
        domain = filters['domain'].replace("'", "''")
        conditions.append(f"domain = '{domain}'")
    
    # Or better: Use BigQuery parameterized queries
    # query_params = []
    # if filters.get('domain'):
    #     query_params.append(bigquery.ScalarQueryParameter('domain', 'STRING', filters['domain']))
    #     conditions.append("domain = @domain")
```

#### 5.2 No Input Validation

- No type checking for filter values
- No length limits
- No format validation (e.g., date formats)

#### 5.3 Hardcoded Project ID Filter

```python
WHERE c.project_id = {self.settings.project_id_filter}
```

- Direct interpolation of project_id
- Should use parameterized query
- No validation that project_id is numeric

---

## 6. Edge Cases

### Identified Edge Cases

#### 6.1 Empty Results

**Current Behavior:**
- Returns empty list `[]`
- No distinction between "no data" and "error"

**Issue:**
- `get_overall_aggregation()` returns default dict if empty
- Other methods return empty lists
- Inconsistent behavior

#### 6.2 NULL Values

**Current Handling:**
```python
if name:  # Only process rows with a quality dimension name
    # ...
```

- Filters out NULL names
- But doesn't handle NULL scores, conversation_ids consistently
- Some methods check `is not None`, others don't

#### 6.3 Missing Contributor Names

**Current Behavior:**
```python
LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c
    ON rd.reviewer_id = c.id
```

- LEFT JOIN means reviewer_name can be NULL
- No handling for missing names
- May display `None` or empty strings

#### 6.4 Duplicate Conversation IDs

**Current Handling:**
- Uses `DISTINCT` in SELECT
- But aggregation logic uses `set()` for conversation_ids
- May still have duplicates if multiple quality dimensions per conversation

#### 6.5 Large Result Sets

**Current Behavior:**
- No pagination
- Loads all results into memory
- Risk of memory issues with large datasets

#### 6.6 Regex Extraction Failures

```python
CASE 
    WHEN REGEXP_CONTAINS(statement, r'\\*\\*domain\\*\\*') THEN
        TRIM(REGEXP_EXTRACT(statement, r'\\*\\*domain\\*\\*\\s*-\\s*([^\\n]+)'))
    ...
END AS domain
```

- If regex doesn't match, returns NULL
- No validation of extracted domain format
- No fallback handling

#### 6.7 Date Range Edge Cases

- No date range validation in filters
- No handling for invalid dates
- No timezone handling

#### 6.8 Score Calculation Edge Cases

```python
if data['scores']:
    avg_score = sum(data['scores']) / len(data['scores'])
```

- Handles empty list correctly
- But doesn't handle:
  - NULL scores in list
  - Negative scores (if invalid)
  - Scores outside expected range

---

## 7. Potential Issues Summary

### Critical Issues

1. **No Error Handling** ⚠️
   - Queries can fail silently or crash endpoints
   - No handling for BigQuery-specific errors
   - No retry logic

2. **SQL Injection Risk** ⚠️
   - Direct string interpolation in SQL
   - Filter values not sanitized
   - Should use parameterized queries

3. **Synchronous Execution in Async Methods** ⚠️
   - Methods marked `async` but execute synchronously
   - Blocks event loop
   - Poor performance

### High Priority Issues

4. **No Query Timeout**
   - Queries can hang indefinitely
   - No timeout configuration

5. **Inconsistent Project ID Usage**
   - Mix of hardcoded `turing-gpt` and settings
   - Maintenance issues

6. **No Input Validation**
   - Filter values not validated
   - No type checking
   - No length limits

### Medium Priority Issues

7. **No Query Caching**
   - Repeated queries increase costs
   - No result caching

8. **No Pagination**
   - All results loaded into memory
   - Risk of memory issues

9. **Complex Query Structure**
   - Hard to maintain
   - Difficult to debug
   - Performance concerns

10. **Inconsistent Error Responses**
    - Some methods return empty lists
    - Others return default dicts
    - No standardized error format

### Low Priority Issues

11. **No Logging**
    - No query logging
    - No performance metrics
    - Difficult to debug issues

12. **No Connection Pooling**
    - Client created once, reused
    - But no explicit pooling configuration

13. **No Query Optimization**
    - No query plan analysis
    - No index hints
    - No query optimization

---

## 8. Recommendations

### Immediate Actions

1. **Add Comprehensive Error Handling**
   - Wrap all BigQuery operations in try-except
   - Handle specific BigQuery exceptions
   - Return appropriate error responses

2. **Fix SQL Injection Vulnerabilities**
   - Use parameterized queries
   - Sanitize all filter inputs
   - Validate input types

3. **Implement True Async Execution**
   - Use ThreadPoolExecutor for blocking operations
   - Add query timeouts
   - Implement cancellation support

### Short-term Improvements

4. **Standardize Project ID Usage**
   - Remove hardcoded `turing-gpt`
   - Use `self.settings.gcp_project_id` everywhere

5. **Add Input Validation**
   - Validate filter parameters
   - Add type checking
   - Implement length limits

6. **Add Logging**
   - Log query execution
   - Log errors with context
   - Add performance metrics

### Long-term Enhancements

7. **Implement Query Caching**
   - Cache results for common queries
   - Use TTL-based invalidation
   - Reduce BigQuery costs

8. **Add Pagination Support**
   - Implement cursor-based pagination
   - Add page size limits
   - Prevent memory issues

9. **Query Optimization**
   - Analyze query plans
   - Add appropriate indexes
   - Optimize CTE structure

10. **Add Monitoring**
    - Track query performance
    - Monitor error rates
    - Alert on failures

---

## 9. Code Quality Assessment

### Strengths

- ✅ Well-structured class with clear separation of concerns
- ✅ Good use of helper methods for code reuse
- ✅ Comprehensive aggregation processing logic
- ✅ Singleton pattern for service instance

### Weaknesses

- ❌ No error handling
- ❌ SQL injection vulnerabilities
- ❌ Inconsistent async/await usage
- ❌ No input validation
- ❌ No logging
- ❌ Hardcoded values
- ❌ Complex, hard-to-maintain queries

### Overall Rating: **C+**

The service provides necessary functionality but has significant reliability and security concerns that need immediate attention.

---

## 10. Testing Recommendations

### Unit Tests Needed

1. **Client Initialization**
   - Test with valid credentials
   - Test with invalid credentials
   - Test with missing credentials file
   - Test with invalid project ID

2. **Query Execution**
   - Test successful queries
   - Test with non-existent tables
   - Test with permission errors
   - Test with invalid SQL

3. **Filter Building**
   - Test SQL injection prevention
   - Test special characters
   - Test NULL values
   - Test empty filters

4. **Result Processing**
   - Test empty results
   - Test NULL values
   - Test duplicate conversation IDs
   - Test missing contributor names

### Integration Tests Needed

1. **End-to-End Query Flow**
   - Test complete aggregation flows
   - Test with real BigQuery data
   - Test error scenarios

2. **Performance Tests**
   - Test query timeouts
   - Test large result sets
   - Test concurrent queries

---

## Conclusion

The `BigQueryService` provides essential functionality for querying review statistics but has **critical security and reliability issues** that must be addressed:

1. **Immediate Priority**: Add error handling and fix SQL injection vulnerabilities
2. **High Priority**: Implement true async execution and add input validation
3. **Medium Priority**: Standardize code, add logging, implement caching

The service is functional but not production-ready without these improvements.
