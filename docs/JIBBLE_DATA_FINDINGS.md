# Jibble Data Findings & Analysis

**Date:** February 2, 2026  
**Status:** Investigation Complete

---

## Executive Summary

Investigation of Jibble time tracking data for Nvidia projects revealed a critical **project mismatch issue** where trainers are clocking into the wrong Jibble projects. This explains why some projects show 0 hours on the dashboard despite having data in the database.

---

## Key Findings

### 1. Project Data Exists in Database

All Nvidia projects have Jibble data synced from the API:

| Project | Hours | Records |
|---------|-------|---------|
| Nvidia - SysBench | 43,343h | 5,200 |
| Nvidia - CFBench Multilingual | 38,853h | 4,406 |
| Nvidia - Multichallenge Advanced | 29,733h | 2,865 |
| Nvidia - Multichallenge | 21,436h | 2,397 |
| Nvidia - InverseIFEval | 20,808h | 2,138 |
| NVIDIA_STEM Math_Eval | 183h | 22 |
| Nvidia - ICPC | 24h | 7 |

### 2. Critical Issue: Projects are SWAPPED in Jibble

**Trainers doing CFBench tasks → Clock into "Nvidia - Multichallenge"**  
**Trainers doing Multichallenge tasks → Clock into "Nvidia - CFBench Multilingual"**

#### Evidence from Jibble API Direct Check:

**CFBench Multilingual Jibble Loggers:**
| Person | Logs to | CFBench Tasks | MC Tasks |
|--------|---------|---------------|----------|
| Brian Tole | CFBench | 0 | 27 |
| Marwan Sherif | CFBench | 0 | 23 |
| Paola Rueda Duarte | CFBench | 0 | 9 |
| Pablo Ariel Pellegrini | CFBench | 0 | 4 |
| Gabriel Glock | CFBench | 0 | 3 |

**Multichallenge Jibble Loggers:**
| Person | Logs to | MC Tasks | CFBench Tasks |
|--------|---------|----------|---------------|
| Uzma Ambreen | Multichallenge | 0 | 148 |
| Fridas Shaibu | Multichallenge | 0 | 109 |
| Ekta Veerwani | Multichallenge | 0 | 84 |
| Ademola Aderele | Multichallenge | 0 | 54 |
| Nandhini M | Multichallenge | 0 | 64 |

### 3. Dashboard Shows 0 Hours Because of Mismatch

The dashboard matches Jibble hours to trainers based on their task data:
- Trainer does **CFBench tasks** → Dashboard looks for **CFBench Jibble hours**
- But trainer clocked into **Multichallenge** in Jibble
- Result: **0 hours displayed**

### 4. Projects Working Correctly

| Project | Status | Reason |
|---------|--------|--------|
| SysBench | ✅ Working | Trainers clock into correct project |
| InverseIFEval | ✅ Working | Trainers clock into correct project |
| CFBench Multilingual | ❌ Shows 0 | Trainers clock into Multichallenge |
| Multichallenge | ❌ Shows 0 | Trainers clock into CFBench |

---

## Jibble API Structure

### Projects in Jibble
```
Nvidia - SysBench (ID: a7b4596c-b632-49ce-bada-33df4491edd2)
Nvidia - CFBench Multilingual (ID: a1b6c34e-67cd-4554-8a7b-4cab2d0fa744)
Nvidia - Multichallenge (ID: 7c305ca8-9675-4edc-a51c-84ad0beaae78)
Nvidia - InverseIFEval (ID: 16e16c63-6deb-4f3c-9d88-46537c006dc9)
Nvidia - Multichallenge Advanced (ID: 2581d1d5-e729-437f-92aa-2e3d7ceebc4f)
Nvidia - ICPC (ID: 1f33fccc-9c95-409a-b17c-541bdd5e446e)
NVIDIA_STEM Math_Eval (ID: e6a4ebc3-5f25-42ce-806e-d23f9026d95b)
```

### TimeEntries Structure
- **"In" entries**: Have `projectId`, `personId`, `time`, `belongsToDate`
- **"Out" entries**: Have `personId`, `time`, but **NO projectId**
- Hours calculated by pairing In/Out events

### TimesheetsSummary Structure
- Provides `payrollHours` per person per day (excludes breaks)
- **Does NOT have project breakdown**
- Used to get accurate payroll hours after break deduction

---

## Payroll vs Tracked Hours

### Definitions
| Type | Description |
|------|-------------|
| **Tracked Hours** | Raw time between clock-in and clock-out |
| **Payroll Hours** | Tracked hours minus unpaid breaks |

### Current Implementation
The sync calculates **payroll hours** proportionally:
```
project_payroll = payroll_hours × (project_tracked / total_tracked)
```

Where:
- `payroll_hours` = From TimesheetsSummary (daily total after breaks)
- `project_tracked` = From TimeEntries (In/Out pairs for specific project)
- `total_tracked` = From TimeEntries (all In/Out pairs)

---

## Recommended Solutions

### Option 1: Fix at Source (Recommended)
- Train users to select the correct Jibble project when clocking in
- This is a behavioral/process fix, not a technical fix
- Prevents future data quality issues

### Option 2: Code Swap Mapping
Add a mapping in the code to swap CFBench ↔ Multichallenge when matching:

```python
# When looking up Jibble hours for tasks:
JIBBLE_PROJECT_SWAP = {
    37: 'Nvidia - Multichallenge',      # CFBench tasks → MC Jibble hours
    39: 'Nvidia - CFBench Multilingual', # MC tasks → CFBench Jibble hours
}
```

**Pros:** Fixes dashboard display immediately  
**Cons:** Masks underlying data quality issue

### Option 3: Show Hours by Jibble Project
- Show hours based on what's actually logged in Jibble
- Accept that CFBench shows Jibble CFBench hours (even if wrong people)
- This is technically accurate but semantically confusing

---

## Database Schema

### jibble_hours Table
```sql
CREATE TABLE jibble_hours (
    id SERIAL PRIMARY KEY,
    member_code VARCHAR(255),      -- Jibble person UUID
    entry_date DATE,
    project VARCHAR(255),          -- Jibble project name
    full_name VARCHAR(255),
    logged_hours FLOAT,
    jibble_email VARCHAR(255),
    turing_email VARCHAR(255),     -- Mapped from Google Sheet
    source VARCHAR(50),            -- 'jibble_api' or 'jibble_api_timeentries'
    last_synced TIMESTAMP
);
```

### Sources
- `jibble_api`: Total hours from TimesheetsSummary (all projects combined)
- `jibble_api_timeentries`: Project-specific hours from TimeEntries API

---

## Sync Jobs

### Current Schedule
1. **Hourly**: Sync `jibble_api` (total hours from TimesheetsSummary)
2. **Every 4 hours**: Sync `jibble_api_timeentries` (project-specific hours)

### Sync Process
1. Fetch bulk payroll data from TimesheetsSummary
2. For each Nvidia project:
   - Fetch TimeEntries from API
   - Calculate In/Out durations
   - Apply payroll ratio
   - Store in database

---

## Files Modified

| File | Changes |
|------|---------|
| `jibble_timeentries_sync.py` | Added payroll calculation logic |
| `query_service.py` | Fixed project ID → Jibble project name mapping |
| `data_sync_service.py` | Fixed Google Sheets credential loading |

---

## Scripts Created for Investigation

| Script | Purpose |
|--------|---------|
| `check_project_jibble.py` | Check Jibble hours by project in DB |
| `verify_cfbench_loggers.py` | Verify who logs CFBench hours |
| `check_jibble_api_direct.py` | Direct API check for projects |
| `check_jibble_final.py` | Final verification of all projects |
| `verify_jibble_vs_tasks.py` | Compare Jibble loggers with task workers |
| `run_payroll_sync_optimized.py` | Optimized payroll sync script |

---

## Next Steps

1. **Decide on solution approach** (Source fix vs Code swap)
2. **If code swap**: Implement mapping in `query_service.py`
3. **If source fix**: Communicate with team leads about correct Jibble project selection
4. **Monitor**: Verify data accuracy after fix is applied
