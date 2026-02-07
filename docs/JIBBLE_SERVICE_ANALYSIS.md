# Jibble Service Analysis

## Executive Summary

This document provides a comprehensive analysis of the Jibble integration services in the NVIDIA Dashboard application. The system integrates with Jibble's time tracking API to sync employee hours, project-specific time entries, and trainer hours data.

**Key Services:**
1. `jibble_service.py` - Core API integration and basic sync operations
2. `jibble_timeentries_sync.py` - Advanced project-specific payroll hours calculation

**Current Status:** Scheduled syncs are **DISABLED** in production (see `main.py` lines 386-441). The system primarily uses BigQuery for Jibble data, with API sync available for manual operations.

---

## 1. Jibble API Integration Details

### 1.1 API Endpoints Used

#### Authentication Endpoint
- **URL:** `https://identity.prod.jibble.io/connect/token`
- **Method:** POST
- **Flow:** OAuth2 Client Credentials
- **Purpose:** Obtain access tokens for API requests

#### Core API Endpoints

| Endpoint | Base URL | Purpose | Used By |
|----------|----------|---------|---------|
| `People` | `jibble_api_url` | Fetch all people/users | `get_people()`, `sync_people()` |
| `Projects` | `jibble_api_url` | Fetch all projects | `get_projects()`, `get_nvidia_project_ids()` |
| `TimesheetsSummary` | `jibble_time_attendance_url` | Pre-calculated daily payroll hours | `get_timesheets_summary()`, `sync_time_entries_for_month()` |
| `TimeEntries` | `jibble_time_tracking_url` | Raw clock-in/out entries | `get_time_entries_by_projects()`, `JibbleTimeEntriesSync` |

### 1.2 API Configuration

Configuration is loaded from environment variables via `get_settings()`:

```python
- jibble_api_key (JIBBLE_API_KEY)
- jibble_api_secret (JIBBLE_API_SECRET)
- jibble_api_url (base API URL)
- jibble_time_tracking_url (time tracking service URL)
- jibble_time_attendance_url (time attendance service URL)
- jibble_project_name (project name filter)
```

### 1.3 API Request Patterns

**Pagination:**
- Uses OData `$top` and `$skip` parameters
- Default page sizes: 100-1000 records per page
- Maximum pages: 20-25 (safety limit)

**Filtering:**
- OData `$filter` syntax for date ranges and project filtering
- Example: `projectId eq '{uuid}' and time ge {start} and time le {end}`

**Date Formatting:**
- ISO 8601 format: `YYYY-MM-DD` for date ranges
- Full timestamps: `YYYY-MM-DDT00:00:00Z` for OData filters

---

## 2. Authentication Mechanism

### 2.1 OAuth2 Client Credentials Flow

**Implementation:** `JibbleService._get_access_token()`

```python
1. Check cached token validity (expires_at check)
2. If expired/missing, POST to identity endpoint
3. Extract access_token and expires_in from response
4. Cache token with expiration (expires_in - 60 seconds buffer)
5. Return token for API requests
```

**Token Caching:**
- Stored in instance variables: `self.access_token`, `self.token_expires_at`
- **Issue:** Token cache is per-instance, not shared across service instances
- **Impact:** Multiple service instances will each request their own tokens

**Token Refresh:**
- Automatic refresh when expired
- 60-second buffer before expiration to prevent race conditions
- Default expiration: 3600 seconds (1 hour)

### 2.2 Error Handling

**Token Request Failures:**
- Raises exception on HTTP errors
- Logs error but doesn't retry automatically
- **Issue:** No retry logic for transient network failures

**Token Usage:**
- Bearer token in `Authorization` header
- Format: `Bearer {access_token}`

---

## 3. Data Transformation Logic

### 3.1 ISO 8601 Duration Parsing

**Function:** `parse_iso8601_duration()` (both services)

**Supported Format:** `PT{n}H{n}M{n}S` or `P{n}DT{n}H{n}M{n}S`

**Implementation:**
```python
- Parses days (D), hours (H), minutes (M), seconds (S)
- Converts to total seconds, then to hours
- Returns rounded to 2 decimal places
- Handles edge cases: empty string, "PT0S" → 0.0
```

**Issues:**
1. **Different implementations:** `jibble_service.py` uses regex search, `jibble_timeentries_sync.py` uses regex match - potential inconsistency
2. **No validation:** Doesn't validate ISO 8601 format strictly
3. **Fractional seconds:** Only handles integer seconds in `jibble_service.py`, but handles floats in `jibble_timeentries_sync.py`

### 3.2 TimesheetsSummary Data Processing

**Function:** `get_timesheets_summary()`

**Data Flow:**
```
1. Fetch from TimesheetsSummary endpoint
2. Extract personId, daily breakdown, total hours
3. Parse payrollHours (preferred) or tracked (fallback)
4. Structure: {person_id: {date_str: hours, _total: total, _name: name}}
```

**Key Fields:**
- `payrollHours`: Actual working hours (excludes unpaid breaks) - **PREFERRED**
- `tracked`: Total tracked time (includes breaks) - **FALLBACK**
- `daily`: Array of `{date, payrollHours}` objects

### 3.3 TimeEntries Data Processing

**Function:** `get_project_specific_hours()` / `calculate_tracked_hours()`

**Data Flow:**
```
1. Fetch TimeEntries filtered by project and date range
2. Group by person_id and belongsToDate
3. Separate In/Out entries
4. Pair In entries with next Out entry
5. Calculate duration between pairs
6. Aggregate per person per day
```

**Pairing Logic:**
- Sorts In/Out entries by time
- For each In entry, finds next Out entry after it
- **Issue:** Doesn't handle missing Out entries (orphaned clock-ins)
- **Issue:** Doesn't validate In/Out pairing (could pair wrong entries)

### 3.4 Payroll Hours Calculation (Advanced)

**Function:** `calculate_project_payroll_hours()` in `jibble_timeentries_sync.py`

**Formula:**
```
project_payroll_hours = day_payroll_hours × (project_tracked_hours / total_tracked_hours)
```

**Purpose:** Proportionally distribute payroll hours (which exclude breaks) across projects based on tracked time.

**Process:**
1. Get tracked hours for specific project from TimeEntries
2. Get total tracked hours (all projects) for the person
3. Get payroll hours from TimesheetsSummary
4. Apply proportional ratio per day

**Edge Cases Handled:**
- Missing payroll data → falls back to tracked hours
- Zero total tracked hours → skips calculation
- Division by zero protection

---

## 4. Sync Scheduling

### 4.1 Current Status

**Scheduled Syncs: DISABLED**

From `main.py` lines 386-441:
```python
# DISABLED: Jibble API sync jobs - using BigQuery for Jibble data instead
```

**Reason:** System migrated to BigQuery as primary data source for Jibble hours.

### 4.2 Original Scheduling Design (Disabled)

**Planned Schedule:**
1. **People Sync:** Hourly (via `jibble_sync_job`)
2. **Hours Sync:** Hourly (via `jibble_sync_job`)
3. **Project-Specific Sync:** Every 4 hours (via `jibble_project_sync_job`)

**Implementation:**
- Uses APScheduler with `IntervalTrigger`
- Runs in thread pool to avoid blocking async event loop
- Logs sync results and errors

### 4.3 Manual Sync Endpoints

**Available via API:**
- `POST /jibble/sync` - Full sync (people + current month entries)
- `GET /jibble/test` - Test connection
- `GET /jibble/trainer-hours` - Get trainer hours for date range

**Usage:** Triggered manually via API calls, not scheduled.

### 4.4 DataSyncService Integration

**Methods:**
- `sync_jibble_hours_from_api()` - Syncs all hours (auto-detects 90 days initial, 7 days subsequent)
- `sync_jibble_hours_by_project()` - Syncs project-specific hours using TimeEntries

**Auto-Detection Logic:**
```python
if no API records exist:
    days_back = 90  # Initial sync
else:
    days_back = 7   # Incremental sync
```

---

## 5. Error Handling

### 5.1 API Request Errors

**HTTP Status Codes:**
- **404:** Returns empty result `{"value": []}` (logged as warning)
- **429 (Rate Limit):** Handled in `JibbleTimeEntriesSync._request_with_retry()` with exponential backoff
- **Other errors:** Raises exception, logged as error

**Retry Logic (TimeEntries Sync Only):**
```python
- MAX_RETRIES = 5
- INITIAL_BACKOFF = 30 seconds
- MAX_BACKOFF = 300 seconds (5 minutes)
- Exponential backoff: backoff *= 2
- Respects Retry-After header if present
```

**Issues:**
1. **No retry in `JibbleService`:** Basic service doesn't retry on failures
2. **Timeout handling:** 60-120 second timeouts, but no retry on timeout
3. **Rate limiting:** Only `JibbleTimeEntriesSync` handles 429, `JibbleService` doesn't

### 5.2 Data Processing Errors

**Parsing Errors:**
- ISO 8601 duration parsing: Returns 0.0 on failure (silent)
- Date parsing: Logs warning, skips entry
- Time parsing: Logs warning, skips entry

**Database Errors:**
- Transaction rollback on exceptions
- Batch commits every 500 records (people sync)
- Logs errors but continues processing

**Issues:**
1. **Silent failures:** Many parsing errors are logged but don't fail the sync
2. **Partial data:** Sync can succeed with some records failing silently
3. **No validation:** Doesn't validate data before storing

### 5.3 Edge Case Handling

**Missing Data:**
- Missing email: Uses None, continues processing
- Missing name: Uses empty string or "Unknown"
- Missing time entry: Skips entry, logs warning
- Missing Out entry: Doesn't count hours (orphaned clock-in)

**Zero Hours:**
- Skips zero-hour entries in sync
- Handles "PT0S" duration strings

**Date Range Issues:**
- Chunked fetching in 14-day intervals to avoid API limits
- Handles month boundaries correctly
- End-of-month calculation handles December → January transition

---

## 6. Edge Cases

### 6.1 Timezone Handling

**Current Implementation:**
- **Issue:** No explicit timezone handling
- ISO 8601 strings with "Z" suffix are parsed as UTC
- `datetime.fromisoformat()` handles timezone-aware strings
- **Risk:** If API returns timezone-naive strings, local timezone assumed

**Recommendations:**
- Explicitly use UTC for all datetime operations
- Convert all timestamps to UTC before storage
- Document timezone assumptions

### 6.2 Missing Data Scenarios

**Missing Out Entries:**
- **Current:** Orphaned clock-ins are ignored (no hours counted)
- **Impact:** Underreported hours if clock-out is missing
- **Recommendation:** Log warnings for orphaned entries, consider manual review

**Missing Payroll Hours:**
- **Current:** Falls back to tracked hours
- **Impact:** May include break time in hours calculation
- **Recommendation:** Flag records where payroll hours unavailable

**Missing Email Mapping:**
- **Current:** Records stored without `turing_email`, filtered at query time
- **Impact:** Records exist but can't be matched to trainers
- **Recommendation:** Periodic review of unmapped records

### 6.3 API Failures

**Partial Failures:**
- **Current:** Chunk failures are logged but sync continues
- **Impact:** Missing data for failed date ranges
- **Recommendation:** Track failed chunks for retry

**Rate Limiting:**
- **Current:** Only `JibbleTimeEntriesSync` handles 429 errors
- **Impact:** `JibbleService` requests may fail on rate limit
- **Recommendation:** Add retry logic to `JibbleService._make_request()`

**Network Timeouts:**
- **Current:** 60-120 second timeouts, no retry
- **Impact:** Transient network issues cause sync failures
- **Recommendation:** Add retry logic with exponential backoff

### 6.4 Data Consistency Issues

**Duplicate Entries:**
- **Current:** Upsert logic based on `person_id + entry_date`
- **Issue:** No unique constraint prevents duplicates
- **Impact:** Potential duplicate records if sync runs concurrently

**Stale Data:**
- **Current:** Syncs replace data for date ranges
- **Issue:** If sync fails partway, partial data remains
- **Impact:** Inconsistent data state

**Project ID Mismatches:**
- **Current:** Hardcoded NVIDIA project IDs in `jibble_timeentries_sync.py`
- **Issue:** Project IDs may change in Jibble
- **Impact:** Missing project data if IDs change

---

## 7. Email Mapping Logic

### 7.1 Mapping Sources

**1. JibblePerson Table:**
- `personal_email` - Jibble login email
- `work_email` - Work email if different
- Synced from `People` endpoint

**2. JibbleEmailMapping Table:**
- Synced from Google Sheet
- Maps `jibble_name` → `turing_email`
- Used for matching Jibble data to trainers

**3. PodLeadMapping Table:**
- Contains `jibble_name` field
- Used in `get_trainer_hours()` for name matching

### 7.2 Matching Logic

**Name-Based Matching:**
```python
1. Lowercase and strip whitespace
2. Match jibble_name from PodLeadMapping to JibblePerson.full_name
3. Create person_id → trainer mapping
```

**Email-Based Matching:**
```python
1. Load name → turing_email from JibbleEmailMapping
2. Match full_name from Jibble API to mapping
3. Enrich records with turing_email
```

**Issues:**
1. **Case sensitivity:** Name matching is case-insensitive, but exact match required
2. **Whitespace:** Stripped, but inconsistent spacing may cause mismatches
3. **Name variations:** Doesn't handle nicknames, middle names, etc.
4. **Multiple matches:** First match wins, no duplicate detection

### 7.3 Matching Flow

**In `get_trainer_hours()`:**
```
1. Get trainers from PodLeadMapping with jibble_name
2. Get all JibblePerson records
3. Create name → person_id mapping (lowercase, stripped)
4. Match trainer jibble_name to JibblePerson.full_name
5. Query time entries for matched person_ids
6. Return trainer hours with email mapping
```

**In `sync_jibble_hours_from_api()`:**
```
1. Fetch timesheets from API (person_id → hours)
2. Load name → turing_email from JibbleEmailMapping
3. Match full_name to mapping (lowercase, stripped)
4. Store with turing_email (may be None)
5. Filtering happens at query time using turing_email
```

---

## 8. Hours Calculation

### 8.1 Calculation Methods

#### Method 1: TimesheetsSummary (Pre-calculated)
**Used by:** `get_timesheets_summary()`, `sync_time_entries_for_month()`

**Source:** `payrollHours` field from API
- Excludes unpaid breaks
- Pre-calculated by Jibble
- Most accurate for payroll purposes

**Formula:** Direct use of API value (parsed from ISO 8601)

#### Method 2: TimeEntries Pairing
**Used by:** `get_project_specific_hours()`, `calculate_tracked_hours()`

**Source:** Raw clock-in/out entries
- Calculates duration between In/Out pairs
- Includes all tracked time (may include breaks)
- Used for project-specific breakdown

**Formula:**
```python
duration = (clock_out_time - clock_in_time).total_seconds() / 3600
daily_hours = sum(all_pair_durations_for_day)
```

#### Method 3: Proportional Payroll Hours
**Used by:** `calculate_project_payroll_hours()`

**Source:** Combination of TimesheetsSummary + TimeEntries

**Formula:**
```python
project_payroll = day_payroll × (project_tracked / total_tracked)
```

**Purpose:** Distribute payroll hours (excluding breaks) proportionally across projects.

### 8.2 Hours Aggregation

**Daily Aggregation:**
- Sums all time entry pairs for a day
- Rounds to 2 decimal places
- Filters zero-hour entries

**Monthly Aggregation:**
- Sums daily hours for date range
- Stored per person per day in database
- Aggregated at query time

**Project Aggregation:**
- Groups by project_id
- Calculates per-project hours per person per day
- Used for project-specific reporting

### 8.3 Calculation Issues

**1. Orphaned Clock-Ins:**
- Missing Out entries don't count hours
- **Impact:** Underreported hours
- **Recommendation:** Log and flag for review

**2. Overlapping Entries:**
- No validation for overlapping In/Out pairs
- **Impact:** Double-counting possible
- **Recommendation:** Validate entry pairs

**3. Break Time:**
- Tracked hours include breaks
- Payroll hours exclude breaks
- **Impact:** Inconsistency between methods
- **Recommendation:** Always prefer payroll hours when available

**4. Rounding:**
- Rounds to 2 decimal places
- **Impact:** Small precision loss
- **Acceptable:** Standard for hours tracking

**5. Negative Hours:**
- No validation for Out before In
- **Impact:** Could produce negative durations
- **Recommendation:** Add validation

---

## 9. Data Flow

### 9.1 Full Sync Flow (`JibbleSyncService.full_sync()`)

```
1. Sync People
   ├─ Fetch from People endpoint (paginated)
   ├─ Upsert to jibble_person table
   └─ Commit in batches of 500

2. Sync Time Entries (Current Month)
   ├─ Calculate month boundaries
   ├─ Fetch from TimesheetsSummary
   ├─ Parse daily payroll hours
   ├─ Upsert to jibble_time_entry table
   └─ Commit transaction
```

### 9.2 Hours Sync Flow (`sync_jibble_hours_from_api()`)

```
1. Auto-detect sync type
   ├─ Check existing API records
   ├─ Determine days_back (90 initial, 7 incremental)

2. Fetch Timesheets (Chunked)
   ├─ Split date range into 14-day chunks
   ├─ Fetch each chunk from TimesheetsSummary
   └─ Merge results

3. Load Email Mappings
   ├─ Query jibble_email_mapping table
   └─ Create name → turing_email lookup

4. Store Records
   ├─ Delete existing API records for date range
   ├─ Insert new records in batches
   └─ Commit transaction
```

### 9.3 Project-Specific Sync Flow (`sync_jibble_hours_by_project()`)

```
1. Initialize TimeEntries Sync Service
   ├─ Load email mappings

2. For Each NVIDIA Project:
   ├─ Fetch In entries for project
   ├─ Get unique people
   ├─ For each person:
   │  ├─ Fetch all person entries
   │  ├─ Calculate project tracked hours
   │  ├─ Calculate total tracked hours
   │  ├─ Fetch payroll hours
   │  └─ Calculate proportional payroll hours
   └─ Store project-specific records

3. Store All Records
   ├─ Delete existing timeentries records
   ├─ Insert new records in batches
   └─ Commit transaction
```

---

## 10. Potential Issues

### 10.1 Critical Issues

**1. Token Cache Not Shared**
- **Issue:** Each service instance caches its own token
- **Impact:** Unnecessary token requests, potential rate limiting
- **Fix:** Use shared cache (Redis, database, or singleton)

**2. No Retry Logic in Core Service**
- **Issue:** `JibbleService._make_request()` doesn't retry on failures
- **Impact:** Transient failures cause sync to fail
- **Fix:** Add retry logic with exponential backoff

**3. Orphaned Clock-Ins Ignored**
- **Issue:** Missing Out entries don't count hours
- **Impact:** Underreported hours
- **Fix:** Log warnings, consider manual review process

**4. Hardcoded Project IDs**
- **Issue:** NVIDIA project IDs hardcoded in `jibble_timeentries_sync.py`
- **Impact:** Breaks if project IDs change
- **Fix:** Load from configuration or database

### 10.2 Moderate Issues

**5. Inconsistent Duration Parsing**
- **Issue:** Two different implementations
- **Impact:** Potential parsing differences
- **Fix:** Consolidate to single implementation

**6. No Timezone Handling**
- **Issue:** Assumes UTC but doesn't enforce
- **Impact:** Potential timezone-related bugs
- **Fix:** Explicit UTC conversion

**7. Partial Sync Failures**
- **Issue:** Chunk failures don't stop sync
- **Impact:** Missing data for failed chunks
- **Fix:** Track failed chunks for retry

**8. Name Matching Fragility**
- **Issue:** Exact match required (case-insensitive)
- **Impact:** Mismatches due to name variations
- **Fix:** Fuzzy matching or better normalization

### 10.3 Minor Issues

**9. No Data Validation**
- **Issue:** Doesn't validate data before storing
- **Impact:** Invalid data in database
- **Fix:** Add validation layer

**10. Silent Parsing Failures**
- **Issue:** Returns 0.0 on parse failure
- **Impact:** Missing hours not detected
- **Fix:** Log errors, flag suspicious records

**11. Concurrent Sync Risk**
- **Issue:** No locking mechanism
- **Impact:** Duplicate records if syncs run concurrently
- **Fix:** Add distributed lock or unique constraints

**12. No Monitoring/Alerting**
- **Issue:** Errors only logged
- **Impact:** Issues not detected promptly
- **Fix:** Add metrics and alerting

---

## 11. Recommendations

### 11.1 Immediate Actions

1. **Add Retry Logic:** Implement exponential backoff retry in `JibbleService._make_request()`
2. **Fix Token Caching:** Use shared cache or singleton pattern
3. **Add Timezone Handling:** Explicitly convert all timestamps to UTC
4. **Consolidate Duration Parsing:** Use single implementation

### 11.2 Short-Term Improvements

1. **Add Data Validation:** Validate all data before storing
2. **Improve Error Handling:** Better error messages and recovery
3. **Add Monitoring:** Track sync success rates, API errors, data quality
4. **Document Edge Cases:** Document all known edge cases and handling

### 11.3 Long-Term Enhancements

1. **Fuzzy Name Matching:** Improve email mapping accuracy
2. **Incremental Sync:** Track last sync time per person/project
3. **Data Quality Checks:** Validate hours against expected ranges
4. **Performance Optimization:** Cache frequently accessed data

---

## 12. API Endpoints Summary

### Jibble API Endpoints Used

| Endpoint | Method | Purpose | Parameters |
|----------|--------|---------|------------|
| `/connect/token` | POST | OAuth2 token | client_id, client_secret |
| `/People` | GET | List all people | $top, $skip |
| `/Projects` | GET | List all projects | $top, $skip |
| `/TimesheetsSummary` | GET | Daily payroll hours | period, date, endDate, $filter |
| `/TimeEntries` | GET | Clock-in/out entries | $filter, $top, $skip, $select |

### Application API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/jibble/test` | GET | Test API connection |
| `/jibble/sync` | POST | Full sync (people + current month) |
| `/jibble/trainer-hours` | GET | Get trainer hours for date range |
| `/jibble/trainer-hours-summary` | GET | Aggregated trainer hours |

---

## 13. Database Schema

### Tables Used

**jibble_person:**
- Stores person data from Jibble API
- Key: `jibble_id` (UUID)

**jibble_time_entry:**
- Stores daily hours per person
- Key: `person_id` + `entry_date`

**jibble_email_mapping:**
- Maps Jibble names/emails to Turing emails
- Synced from Google Sheet

**jibble_hours:**
- Stores hours from multiple sources
- Sources: `bigquery`, `jibble_api`, `jibble_api_timeentries`

**pod_lead_mapping:**
- Trainer to Pod Lead mapping
- Contains `jibble_name` for matching

---

## Conclusion

The Jibble integration provides comprehensive time tracking functionality with two main approaches:
1. **Simple sync** using pre-calculated TimesheetsSummary (faster, less detailed)
2. **Advanced sync** using TimeEntries for project-specific payroll hours (slower, more accurate)

**Current State:** Scheduled syncs are disabled in favor of BigQuery, but API sync remains available for manual operations and provides more detailed project breakdowns.

**Key Strengths:**
- Comprehensive API integration
- Multiple sync strategies for different use cases
- Good error logging
- Flexible email mapping

**Key Weaknesses:**
- No retry logic in core service
- Token caching not shared
- Fragile name matching
- Limited error recovery

**Priority Fixes:**
1. Add retry logic to core API requests
2. Implement shared token cache
3. Add timezone handling
4. Improve error recovery
