"""
Jibble TimeEntries-based sync for project-specific PAYROLL hours.

This module:
1. Fetches payroll hours per person per day from TimesheetsSummary (excludes breaks)
2. Fetches tracked hours per project from TimeEntries
3. Calculates project-specific payroll hours proportionally

Formula: project_payroll = payroll_hours × (project_tracked / total_tracked)
"""

import os
import re
import logging
import time
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Optional, Tuple
import requests

from app.constants import get_constants

logger = logging.getLogger(__name__)

# Retry settings
MAX_RETRIES = 5
INITIAL_BACKOFF = 30  # seconds
MAX_BACKOFF = 300  # 5 minutes

# Nvidia project IDs - get from centralized constants
_constants = get_constants()
NVIDIA_PROJECTS = _constants.jibble.JIBBLE_UUID_TO_NAME.copy()


def parse_iso8601_duration(duration_str: str) -> float:
    """Parse ISO 8601 duration string to hours."""
    if not duration_str:
        return 0.0
    
    hours = 0.0
    # Handle days
    day_match = re.match(r'P(\d+)D', duration_str)
    if day_match:
        hours += int(day_match.group(1)) * 24
    
    # Handle time portion
    time_match = re.search(r'T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?', duration_str)
    if time_match:
        h, m, s = time_match.groups()
        if h:
            hours += int(h)
        if m:
            hours += int(m) / 60
        if s:
            hours += float(s) / 3600
    
    return hours


class JibbleTimeEntriesSync:
    """Sync Jibble PAYROLL hours using TimeEntries + TimesheetsSummary."""
    
    def __init__(self):
        self.client_id = os.getenv("JIBBLE_API_KEY")
        self.client_secret = os.getenv("JIBBLE_API_SECRET")
        self.token = None
        self.token_expires = None
        # Cache for payroll hours: {person_id: {date: payroll_hours}}
        self._payroll_cache = {}
    
    def _get_token(self) -> str:
        """Get or refresh OAuth token."""
        if self.token and self.token_expires and datetime.now() < self.token_expires:
            return self.token
        
        response = requests.post(
            "https://identity.prod.jibble.io/connect/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        self.token = data["access_token"]
        self.token_expires = datetime.now() + timedelta(seconds=data.get("expires_in", 3600) - 60)
        
        return self.token
    
    def _get_headers(self) -> Dict:
        """Get request headers with auth token."""
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Accept": "application/json"
        }
    
    def _request_with_retry(self, url: str, params: Dict) -> Optional[requests.Response]:
        """Make a request with exponential backoff retry on rate limiting."""
        backoff = INITIAL_BACKOFF
        
        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.get(
                    url,
                    headers=self._get_headers(),
                    params=params,
                    timeout=120
                )
                
                if resp.status_code == 429:
                    # Rate limited - wait and retry
                    retry_after = int(resp.headers.get('Retry-After', backoff))
                    wait_time = max(retry_after, backoff)
                    logger.warning(f"Rate limited (429). Waiting {wait_time}s before retry {attempt + 1}/{MAX_RETRIES}")
                    time.sleep(wait_time)
                    backoff = min(backoff * 2, MAX_BACKOFF)
                    continue
                
                return resp
                
            except requests.exceptions.Timeout:
                logger.warning(f"Request timeout. Retry {attempt + 1}/{MAX_RETRIES}")
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
            except Exception as e:
                logger.error(f"Request error: {e}")
                return None
        
        logger.error(f"Max retries ({MAX_RETRIES}) exceeded")
        return None
    
    def fetch_person_payroll_hours(self, person_id: str, days_back: int = 90) -> Dict[str, float]:
        """
        Fetch payroll hours per day for a person from TimesheetsSummary.
        Payroll hours = tracked time minus unpaid breaks.
        
        Returns: {date_str: payroll_hours}
        """
        # Check cache first
        if person_id in self._payroll_cache:
            return self._payroll_cache[person_id]
        
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        # Fetch in 14-day chunks to avoid API limits
        daily_payroll = {}
        current_start = start_date
        
        while current_start < end_date:
            current_end = min(current_start + timedelta(days=14), end_date)
            
            params = {
                "period": "Custom",
                "date": current_start.strftime("%Y-%m-%d"),
                "endDate": current_end.strftime("%Y-%m-%d"),
                "$filter": f"personId eq {person_id}"
            }
            
            resp = self._request_with_retry(
                "https://time-attendance.prod.jibble.io/v1/TimesheetsSummary",
                params
            )
            
            if resp and resp.status_code == 200:
                data = resp.json()
                for entry in data.get("value", []):
                    for day in entry.get("daily", []):
                        date_str = day.get("date")
                        payroll_duration = day.get("payrollHours", "PT0S")
                        payroll_hours = parse_iso8601_duration(payroll_duration)
                        if date_str and payroll_hours > 0:
                            daily_payroll[date_str] = payroll_hours
            
            current_start = current_end + timedelta(days=1)
            time.sleep(0.3)  # Small delay between chunks
        
        # Cache result
        self._payroll_cache[person_id] = daily_payroll
        return daily_payroll
    
    def fetch_project_in_entries(self, project_id: str, days_back: int = 90) -> List[Dict]:
        """Fetch all 'In' entries for a specific project."""
        all_entries = []
        skip = 0
        batch_size = 1000
        
        while True:
            params = {
                "$filter": f"projectId eq {project_id}",
                "$top": batch_size,
                "$skip": skip,
                "$orderby": "time desc",
                "$expand": "person($select=fullName)"
            }
            
            resp = self._request_with_retry(
                "https://time-tracking.prod.jibble.io/v1/TimeEntries",
                params
            )
            
            if resp is None or resp.status_code != 200:
                if resp:
                    logger.warning(f"Error fetching entries: {resp.status_code}")
                break
            
            entries = resp.json().get("value", [])
            if not entries:
                break
            
            all_entries.extend(entries)
            skip += batch_size
            logger.info(f"    Fetched {len(all_entries)} entries so far...")
            
            if len(entries) < batch_size:
                break
            
            # Small delay between batches to avoid rate limiting
            time.sleep(1)
        
        return all_entries
    
    def fetch_person_entries(self, person_id: str) -> List[Dict]:
        """Fetch all entries for a person (to get Out entries)."""
        all_entries = []
        skip = 0
        batch_size = 500
        
        while True:
            params = {
                "$filter": f"personId eq {person_id}",
                "$top": batch_size,
                "$skip": skip,
                "$orderby": "time"
            }
            
            resp = self._request_with_retry(
                "https://time-tracking.prod.jibble.io/v1/TimeEntries",
                params
            )
            
            if resp is None or resp.status_code != 200:
                break
            
            entries = resp.json().get("value", [])
            if not entries:
                break
            
            all_entries.extend(entries)
            skip += batch_size
            
            if len(entries) < batch_size:
                break
            
            # Small delay between batches
            time.sleep(0.5)
        
        return all_entries
    
    def calculate_tracked_hours(self, person_entries: List[Dict], project_id: Optional[str] = None) -> Dict[str, float]:
        """
        Calculate tracked hours per day from In/Out pairs.
        
        If project_id is provided, only count hours for that project.
        If project_id is None, count ALL hours (total tracked across all projects).
        
        Returns: {date_str: tracked_hours}
        """
        daily_hours = defaultdict(float)
        
        # Sort by time
        person_entries.sort(key=lambda x: x.get("time", ""))
        
        for i, entry in enumerate(person_entries):
            entry_project = entry.get("projectId")
            
            # Filter by project if specified (only when project_id is set)
            # When project_id is None, include ALL entries regardless of their projectId
            if project_id is not None and entry_project != project_id:
                continue
            
            if entry.get("type") == "In":
                in_time_str = entry.get("time")
                date = entry.get("belongsToDate")
                
                if not in_time_str:
                    continue
                
                try:
                    in_time = datetime.fromisoformat(in_time_str.replace("Z", "+00:00"))
                except:
                    continue
                
                # Find the next Out entry
                for j in range(i + 1, len(person_entries)):
                    if person_entries[j].get("type") == "Out":
                        out_time_str = person_entries[j].get("time")
                        if out_time_str:
                            try:
                                out_time = datetime.fromisoformat(out_time_str.replace("Z", "+00:00"))
                                duration_hours = (out_time - in_time).total_seconds() / 3600
                                
                                # Sanity check
                                if 0 < duration_hours < 24:
                                    daily_hours[date] += duration_hours
                            except:
                                pass
                        break
        
        return dict(daily_hours)
    
    def calculate_project_payroll_hours(
        self, 
        person_id: str, 
        person_entries: List[Dict], 
        project_id: str
    ) -> Dict[str, float]:
        """
        Calculate PAYROLL hours per day for a specific project.
        
        Formula: project_payroll = day_payroll × (project_tracked / total_tracked)
        
        This ensures breaks are excluded proportionally.
        """
        # Get tracked hours for this specific project
        project_tracked = self.calculate_tracked_hours(person_entries, project_id)
        
        if not project_tracked:
            return {}
        
        # Get total tracked hours (all projects) for this person
        total_tracked = self.calculate_tracked_hours(person_entries, project_id=None)
        
        # Get payroll hours from TimesheetsSummary
        payroll_hours = self.fetch_person_payroll_hours(person_id)
        
        # Calculate proportional payroll hours per day
        daily_payroll = {}
        for date, proj_hrs in project_tracked.items():
            total_hrs = total_tracked.get(date, proj_hrs)
            day_payroll = payroll_hours.get(date, 0)
            
            if total_hrs > 0 and day_payroll > 0:
                # Apply proportion: project_payroll = payroll × (project / total)
                ratio = proj_hrs / total_hrs
                daily_payroll[date] = round(day_payroll * ratio, 2)
            elif proj_hrs > 0:
                # No payroll data available, fall back to tracked hours
                # (This handles cases where TimesheetsSummary is missing)
                daily_payroll[date] = round(proj_hrs, 2)
        
        return daily_payroll
    
    def sync_nvidia_project_hours(self, project_id: str, project_name: str) -> List[Dict]:
        """Sync PAYROLL hours for a single Nvidia project."""
        logger.info(f"Syncing {project_name} (payroll hours)...")
        
        # Clear payroll cache for fresh data
        self._payroll_cache = {}
        
        # Get all In entries for this project
        in_entries = self.fetch_project_in_entries(project_id)
        logger.info(f"  Found {len(in_entries)} In entries")
        
        if not in_entries:
            return []
        
        # Get unique people
        people = {}
        for e in in_entries:
            pid = e.get("personId")
            pname = e.get("person", {}).get("fullName", "Unknown")
            people[pid] = pname
        
        logger.info(f"  Processing {len(people)} people for PAYROLL hours...")
        
        # Calculate payroll hours for each person
        results = []
        processed = 0
        
        for person_id, person_name in people.items():
            processed += 1
            
            if processed % 20 == 0:
                logger.info(f"    Processed {processed}/{len(people)} people")
            
            # Fetch all entries for this person
            person_entries = self.fetch_person_entries(person_id)
            
            # Calculate PAYROLL hours per day (excludes breaks)
            daily_payroll = self.calculate_project_payroll_hours(
                person_id, person_entries, project_id
            )
            
            # Create records
            for date, hours in daily_payroll.items():
                if hours > 0:
                    results.append({
                        "person_id": person_id,
                        "full_name": person_name,
                        "project": project_name,
                        "project_id": project_id,
                        "entry_date": date,
                        "logged_hours": round(hours, 2),
                        "source": "jibble_api_timeentries"
                    })
        
        total_hours = sum(r["logged_hours"] for r in results)
        logger.info(f"  Completed: {len(results)} records, {total_hours:.2f} total PAYROLL hours")
        
        return results
    
    def sync_all_nvidia_projects(self) -> Dict[str, List[Dict]]:
        """Sync hours for all Nvidia projects."""
        all_results = {}
        
        for i, (project_id, project_name) in enumerate(NVIDIA_PROJECTS.items()):
            if i > 0:
                # Wait between projects to avoid rate limiting
                logger.info("Waiting 30s before next project to avoid rate limiting...")
                time.sleep(30)
            
            results = self.sync_nvidia_project_hours(project_id, project_name)
            all_results[project_name] = results
        
        return all_results


def test_sync():
    """Test the TimeEntries sync for one project."""
    from dotenv import load_dotenv
    load_dotenv()
    
    sync = JibbleTimeEntriesSync()
    
    # Test with SysBench only
    project_id = "a7b4596c-b632-49ce-bada-33df4491edd2"
    project_name = "Nvidia - SysBench"
    
    print(f"Testing sync for {project_name}...")
    results = sync.sync_nvidia_project_hours(project_id, project_name)
    
    # Aggregate by person
    person_totals = defaultdict(float)
    for r in results:
        person_totals[r["full_name"]] += r["logged_hours"]
    
    print(f"\nTop 10 people by hours:")
    for name, hours in sorted(person_totals.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  {name}: {hours:.2f}h")
    
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    test_sync()
