"""
Jibble API Service - Handles authentication and API calls to Jibble
Integrated into the nvidia dashboard app
"""
import re
import logging
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date

from app.config import get_settings
from app.models.db_models import JibblePerson, JibbleTimeEntry, JibbleEmailMapping, PodLeadMapping

logger = logging.getLogger(__name__)


class JibbleService:
    """Service for interacting with Jibble API"""
    
    def __init__(self):
        settings = get_settings()
        self.client_id = settings.jibble_api_key
        self.client_secret = settings.jibble_api_secret
        self.base_url = settings.jibble_api_url
        self.time_tracking_url = settings.jibble_time_tracking_url
        self.time_attendance_url = settings.jibble_time_attendance_url
        self.project_name = settings.jibble_project_name
        self.access_token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None
        
        # Log credential status on init (without revealing secrets)
        if self.client_id and self.client_secret:
            logger.info(f"Jibble credentials configured (client_id: {self.client_id[:8]}...)")
        else:
            logger.warning("Jibble credentials not configured - set JIBBLE_API_KEY and JIBBLE_API_SECRET in .env")
    
    def _get_access_token(self) -> str:
        """Get OAuth2 access token using client credentials flow"""
        # Return cached token if still valid
        if self.access_token and self.token_expires_at and datetime.now() < self.token_expires_at:
            return self.access_token
        
        if not self.client_id or not self.client_secret:
            raise ValueError("Jibble client_id and client_secret are required")
        
        token_url = "https://identity.prod.jibble.io/connect/token"
        
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
        }
        
        try:
            response = requests.post(token_url, data=payload, headers=headers, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            self.access_token = data["access_token"]
            expires_in = data.get("expires_in", 3600)
            self.token_expires_at = datetime.now() + timedelta(seconds=expires_in - 60)
            
            logger.info("Successfully obtained Jibble access token")
            return self.access_token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get Jibble access token: {e}")
            raise
    
    def _make_request(self, endpoint: str, method: str = "GET", params: Dict = None, 
                      base_url: str = None) -> Dict:
        """Make authenticated request to Jibble API"""
        token = self._get_access_token()
        url = f"{base_url or self.base_url}/{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        
        try:
            response = requests.request(method, url, headers=headers, params=params, timeout=60)
            
            if response.status_code == 404:
                logger.warning(f"Jibble API 404 for {endpoint}")
                return {"value": []}
            
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Jibble API error for {endpoint}: {e}")
            raise
    
    def get_people(self, page_size: int = 1000, max_pages: int = 25) -> List[Dict]:
        """Fetch all people from Jibble with pagination"""
        all_people = []
        skip = 0
        
        for page in range(max_pages):
            params = {
                "$top": page_size,
                "$skip": skip,
            }
            
            try:
                data = self._make_request("People", params=params)
                people = data.get("value", [])
                
                if not people:
                    break
                
                all_people.extend(people)
                logger.info(f"Fetched page {page + 1}: {len(people)} people (total: {len(all_people)})")
                
                if len(people) < page_size:
                    break
                
                skip += page_size
                
            except Exception as e:
                logger.error(f"Error fetching people page {page + 1}: {e}")
                break
        
        logger.info(f"Total people fetched: {len(all_people)}")
        return all_people
    
    @staticmethod
    def parse_iso8601_duration(duration_str: str) -> float:
        """Parse ISO 8601 duration string to hours"""
        if not duration_str or duration_str == "PT0S":
            return 0.0
        
        total_seconds = 0.0
        
        # Match days (P1D, P2D, etc)
        days_match = re.search(r'(\d+)D', duration_str)
        if days_match:
            total_seconds += int(days_match.group(1)) * 24 * 3600
        
        # Match hours (T8H, etc)
        hours_match = re.search(r'(\d+)H', duration_str)
        if hours_match:
            total_seconds += int(hours_match.group(1)) * 3600
        
        # Match minutes (30M, etc)
        minutes_match = re.search(r'(\d+)M', duration_str)
        if minutes_match:
            total_seconds += int(minutes_match.group(1)) * 60
        
        # Match seconds (55.123S, etc)
        seconds_match = re.search(r'([\d.]+)S', duration_str)
        if seconds_match:
            total_seconds += float(seconds_match.group(1))
        
        return round(total_seconds / 3600, 2)
    
    def get_timesheets_summary(self, start_date: datetime, end_date: datetime) -> Dict[str, Dict[str, float]]:
        """
        Fetch pre-calculated daily hours from TimesheetsSummary endpoint
        
        Returns: {person_id: {date_str: total_hours, _name: full_name, _total: total_hours}}
        """
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        params = {
            "period": "Custom",
            "date": start_str,
            "endDate": end_str,
        }
        
        try:
            data = self._make_request("TimesheetsSummary", params=params, 
                                      base_url=self.time_attendance_url)
            
            results = data.get("value", [])
            logger.info(f"Fetched timesheets summary for {len(results)} people ({start_str} to {end_str})")
            
            # Parse results into {person_id: {date: hours}}
            daily_hours = {}
            
            for entry in results:
                person_id = entry.get("personId")
                if not person_id:
                    continue
                
                daily_hours[person_id] = {}
                
                # Parse total (for reference)
                total_duration = entry.get("total", "PT0S")
                total_hours = self.parse_iso8601_duration(total_duration)
                
                # Parse daily breakdown - use payrollHours (actual working hours after breaks)
                daily_data = entry.get("daily", [])
                for day in daily_data:
                    date_str = day.get("date")
                    payroll = day.get("payrollHours") or day.get("tracked", "PT0S")
                    hours = self.parse_iso8601_duration(payroll)
                    
                    if date_str:
                        daily_hours[person_id][date_str] = hours
                
                # Store total and name in special keys
                daily_hours[person_id]["_total"] = total_hours
                person_info = entry.get("person", {})
                daily_hours[person_id]["_name"] = person_info.get("fullName", "")
            
            return daily_hours
            
        except Exception as e:
            logger.error(f"Error fetching timesheets summary: {e}")
            return {}
    
    def test_connection(self) -> Dict[str, Any]:
        """Test the Jibble API connection by verifying OAuth token"""
        try:
            # Just verify we can get a token - don't rely on People endpoint
            # as it may have intermittent server issues
            token = self._get_access_token()
            
            return {
                "success": True,
                "message": "Successfully obtained Jibble API token",
                "has_token": bool(token),
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Failed to connect: {str(e)}",
                "has_token": False,
            }
    
    def get_projects(self, page_size: int = 100, max_pages: int = 20) -> List[Dict]:
        """Fetch all projects from Jibble with pagination"""
        all_projects = []
        skip = 0
        
        for page in range(max_pages):
            params = {
                "$top": page_size,
                "$skip": skip,
            }
            
            try:
                data = self._make_request("Projects", params=params)
                projects = data.get("value", [])
                
                if not projects:
                    break
                
                all_projects.extend(projects)
                logger.info(f"Fetched page {page + 1}: {len(projects)} projects (total: {len(all_projects)})")
                
                if len(projects) < page_size:
                    break
                
                skip += page_size
                
            except Exception as e:
                logger.error(f"Error fetching projects page {page + 1}: {e}")
                break
        
        logger.info(f"Total projects fetched: {len(all_projects)}")
        return all_projects
    
    def get_nvidia_project_ids(self) -> Dict[str, str]:
        """
        Get Nvidia project IDs by searching project names.
        Returns: {project_name: project_id}
        """
        settings = get_settings()
        nvidia_keywords = ["nvidia", "sysbench", "cfbench", "ifeval", "multichallenge", "icpc", "stem math"]
        
        projects = self.get_projects()
        nvidia_projects = {}
        
        for proj in projects:
            name = proj.get("name", "")
            proj_id = proj.get("id", "")
            status = proj.get("status", "")
            
            # Only include active projects
            if status != "Active":
                continue
            
            name_lower = name.lower()
            if any(kw in name_lower for kw in nvidia_keywords):
                # Check if it's really an Nvidia project (not Amazon, Google, etc.)
                if "nvidia" in name_lower or ("nvidia" not in name_lower and 
                    not any(x in name_lower for x in ["amazon", "google", "meta", "microsoft", "anthropic", "tencent"])):
                    nvidia_projects[name] = proj_id
                    logger.info(f"Found Nvidia project: {name} ({proj_id})")
        
        return nvidia_projects
    
    def get_time_entries_by_projects(
        self, 
        project_ids: List[str], 
        start_date: datetime,
        end_date: datetime,
        page_size: int = 500,
        max_entries: int = 100000
    ) -> List[Dict]:
        """
        Fetch time entries filtered by project IDs and date range.
        
        Args:
            project_ids: List of Jibble project UUIDs to filter by
            start_date: Start of date range
            end_date: End of date range
            page_size: Entries per page
            max_entries: Maximum total entries to fetch
            
        Returns:
            List of time entry records with person_id, project info, and duration
        """
        all_entries = []
        
        # Format dates for OData filter
        start_str = start_date.strftime('%Y-%m-%dT00:00:00Z')
        end_str = end_date.strftime('%Y-%m-%dT23:59:59Z')
        
        for project_id in project_ids:
            skip = 0
            project_entries = 0
            
            while True:
                # Build OData filter for this project and date range
                # Filter by projectId and time range
                filter_str = f"projectId eq '{project_id}' and time ge {start_str} and time le {end_str}"
                
                params = {
                    "$top": page_size,
                    "$skip": skip,
                    "$filter": filter_str,
                    "$select": "id,personId,projectId,time,belongsToDate,type,status",
                }
                
                try:
                    data = self._make_request(
                        "TimeEntries", 
                        params=params, 
                        base_url=self.time_tracking_url
                    )
                    entries = data.get("value", [])
                    
                    if not entries:
                        break
                    
                    all_entries.extend(entries)
                    project_entries += len(entries)
                    
                    if len(all_entries) >= max_entries:
                        logger.warning(f"Reached max entries limit ({max_entries})")
                        break
                    
                    if len(entries) < page_size:
                        break
                    
                    skip += page_size
                    
                except Exception as e:
                    logger.error(f"Error fetching time entries for project {project_id}: {e}")
                    break
            
            logger.info(f"Fetched {project_entries} entries for project {project_id}")
        
        logger.info(f"Total time entries fetched: {len(all_entries)}")
        return all_entries
    
    def get_nvidia_daily_hours(
        self, 
        start_date: datetime, 
        end_date: datetime
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get daily hours for Nvidia projects, aggregated per person.
        
        Uses TimesheetsSummary endpoint for pre-calculated daily hours,
        but also builds a person_id -> email mapping.
        
        Returns: {
            person_id: {
                'email': personal_email,
                'name': full_name,
                'daily': {date_str: hours},
                'total': total_hours
            }
        }
        """
        # First get the timesheets summary
        daily_hours = self.get_timesheets_summary(start_date, end_date)
        
        # Enhance with email mapping from people
        people = self.get_people()
        person_email_map = {}
        for person in people:
            pid = person.get("id")
            email = person.get("email", "").lower() if person.get("email") else None
            name = person.get("fullName", "")
            if pid:
                person_email_map[pid] = {"email": email, "name": name}
        
        # Combine data
        result = {}
        for person_id, data in daily_hours.items():
            person_info = person_email_map.get(person_id, {})
            
            # Extract daily breakdown (filter out metadata keys)
            daily = {k: v for k, v in data.items() if not k.startswith("_")}
            
            result[person_id] = {
                "email": person_info.get("email"),
                "name": data.get("_name") or person_info.get("name", ""),
                "daily": daily,
                "total": data.get("_total", 0),
            }
        
        logger.info(f"Got daily hours for {len(result)} people")
        return result
    
    def get_project_specific_hours(
        self, 
        project_ids: List[str],
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate hours per person per day for specific projects.
        
        Uses TimeEntries endpoint to get project-specific data,
        then calculates duration between clock-in and clock-out.
        
        Returns: {person_id: {date_str: hours}}
        """
        entries = self.get_time_entries_by_projects(project_ids, start_date, end_date)
        
        # Group entries by person and date
        # Each entry has 'type' ('In' or 'Out') and we need to pair them
        person_entries = {}
        
        for entry in entries:
            person_id = entry.get("personId")
            belongs_to_date = entry.get("belongsToDate")  # Date the entry belongs to
            entry_type = entry.get("type")  # 'In' or 'Out'
            time_str = entry.get("time")
            
            if not all([person_id, belongs_to_date, entry_type, time_str]):
                continue
            
            if person_id not in person_entries:
                person_entries[person_id] = {}
            
            if belongs_to_date not in person_entries[person_id]:
                person_entries[person_id][belongs_to_date] = {"ins": [], "outs": []}
            
            try:
                entry_time = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                if entry_type == "In":
                    person_entries[person_id][belongs_to_date]["ins"].append(entry_time)
                elif entry_type == "Out":
                    person_entries[person_id][belongs_to_date]["outs"].append(entry_time)
            except Exception as e:
                logger.warning(f"Error parsing time {time_str}: {e}")
        
        # Calculate hours for each person/date
        result = {}
        for person_id, dates in person_entries.items():
            result[person_id] = {}
            
            for date_str, times in dates.items():
                ins = sorted(times["ins"])
                outs = sorted(times["outs"])
                
                total_seconds = 0
                
                # Pair in/out times
                for i, clock_in in enumerate(ins):
                    # Find the next clock-out after this clock-in
                    clock_out = None
                    for out_time in outs:
                        if out_time > clock_in:
                            clock_out = out_time
                            break
                    
                    if clock_out:
                        duration = (clock_out - clock_in).total_seconds()
                        total_seconds += duration
                
                hours = round(total_seconds / 3600, 2)
                if hours > 0:
                    result[person_id][date_str] = hours
        
        logger.info(f"Calculated project-specific hours for {len(result)} people")
        return result


class JibbleSyncService:
    """Service for syncing Jibble data to the database"""
    
    def __init__(self, db: Session):
        self.db = db
        self.jibble = JibbleService()
    
    def sync_people(self) -> int:
        """Sync all people from Jibble to the database"""
        try:
            people = self.jibble.get_people()
            synced_count = 0
            
            for person in people:
                jibble_id = person.get("id")
                if not jibble_id:
                    continue
                
                personal_email = person.get("email", "").lower() if person.get("email") else None
                work_email = person.get("workEmail", "").lower() if person.get("workEmail") else None
                
                # Get latest time entry timestamp
                latest_entry = person.get("latestTimeEntryTime")
                latest_time = None
                if latest_entry:
                    try:
                        latest_time = datetime.fromisoformat(latest_entry.replace("Z", "+00:00"))
                    except:
                        pass
                
                # Upsert person
                existing = self.db.query(JibblePerson).filter_by(jibble_id=jibble_id).first()
                
                if existing:
                    existing.full_name = person.get("fullName")
                    existing.first_name = person.get("firstName")
                    existing.last_name = person.get("lastName")
                    existing.personal_email = personal_email
                    existing.work_email = work_email
                    existing.status = person.get("status")
                    existing.latest_time_entry = latest_time
                    existing.last_synced = func.now()
                else:
                    new_person = JibblePerson(
                        jibble_id=jibble_id,
                        full_name=person.get("fullName"),
                        first_name=person.get("firstName"),
                        last_name=person.get("lastName"),
                        personal_email=personal_email,
                        work_email=work_email,
                        status=person.get("status"),
                        latest_time_entry=latest_time,
                    )
                    self.db.add(new_person)
                
                synced_count += 1
                
                # Commit in batches
                if synced_count % 500 == 0:
                    self.db.commit()
                    logger.info(f"Synced {synced_count} people so far...")
            
            self.db.commit()
            logger.info(f"Synced {synced_count} people from Jibble")
            return synced_count
            
        except Exception as e:
            logger.error(f"Error syncing people: {e}")
            self.db.rollback()
            raise
    
    def sync_time_entries_for_month(self) -> Dict:
        """
        Sync time entries from Jibble for the current month.
        Uses the TimesheetsSummary endpoint for pre-calculated daily hours.
        """
        try:
            # Calculate current month boundaries
            today = datetime.now()
            start_of_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # End of month
            if today.month == 12:
                end_of_month = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                end_of_month = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
            end_of_month = end_of_month.replace(hour=23, minute=59, second=59)
            
            month_str = start_of_month.strftime("%Y-%m")
            logger.info(f"Syncing time entries for {month_str} ({start_of_month.date()} to {end_of_month.date()})")
            
            # Get people to build person_id -> email lookup
            people = self.db.query(JibblePerson).all()
            person_id_to_email = {}
            for p in people:
                email = p.personal_email or p.work_email
                if email:
                    person_id_to_email[p.jibble_id] = email.lower()
            
            # Fetch pre-calculated daily hours
            daily_hours = self.jibble.get_timesheets_summary(start_of_month, end_of_month)
            
            total_synced = 0
            
            for person_id, data in daily_hours.items():
                for date_str, hours in data.items():
                    # Skip metadata keys
                    if date_str.startswith("_"):
                        continue
                    
                    # Skip zero hours entries
                    if hours == 0:
                        continue
                    
                    try:
                        entry_date_obj = datetime.fromisoformat(date_str).date()
                        entry_date = datetime.combine(entry_date_obj, datetime.min.time())
                        
                        # Check for existing entry
                        existing = self.db.query(JibbleTimeEntry).filter(
                            JibbleTimeEntry.person_id == person_id,
                            cast(JibbleTimeEntry.entry_date, Date) == entry_date_obj
                        ).first()
                        
                        if existing:
                            existing.total_hours = hours
                            existing.last_synced = func.now()
                        else:
                            new_entry = JibbleTimeEntry(
                                person_id=person_id,
                                entry_date=entry_date,
                                total_hours=hours,
                            )
                            self.db.add(new_entry)
                        
                        total_synced += 1
                        
                    except Exception as e:
                        logger.warning(f"Error saving entry for {person_id}/{date_str}: {e}")
                        continue
            
            self.db.commit()
            
            return {
                "month": month_str,
                "start": start_of_month.date().isoformat(),
                "end": end_of_month.date().isoformat(),
                "entries": total_synced,
            }
            
        except Exception as e:
            logger.error(f"Error syncing time entries: {e}")
            self.db.rollback()
            raise
    
    def get_trainer_hours(self, start_date: datetime = None, end_date: datetime = None) -> List[Dict]:
        """
        Get daily hours for trainers mapped from pod_lead_mapping table.
        Uses name matching to link trainers to their Jibble time entries.
        
        Returns list of {trainer_email, trainer_name, date, hours, pod_lead}
        """
        # Get all trainers from pod_lead_mapping with jibble_name
        trainers = self.db.query(PodLeadMapping).filter(
            PodLeadMapping.jibble_name.isnot(None)
        ).all()
        
        if not trainers:
            logger.warning("No trainers with Jibble names found in pod_lead_mapping")
            return []
        
        logger.info(f"Found {len(trainers)} trainers with Jibble names")
        
        # Get all Jibble people and create name -> person_id mapping
        jibble_people = self.db.query(JibblePerson).all()
        name_to_uuid = {}
        for jp in jibble_people:
            if jp.full_name:
                name_key = jp.full_name.lower().strip()
                # Store first match (in case of duplicates)
                if name_key not in name_to_uuid:
                    name_to_uuid[name_key] = jp.jibble_id
        
        logger.info(f"Created name-to-UUID mapping for {len(name_to_uuid)} Jibble people")
        
        # Build trainer name -> trainer mapping and collect UUIDs
        trainer_by_uuid = {}
        for t in trainers:
            if t.jibble_name:
                name_key = t.jibble_name.lower().strip()
                uuid = name_to_uuid.get(name_key)
                if uuid:
                    trainer_by_uuid[uuid] = t
        
        logger.info(f"Matched {len(trainer_by_uuid)} trainers to Jibble UUIDs")
        
        if not trainer_by_uuid:
            logger.warning("No trainers matched to Jibble UUIDs")
            return []
        
        # Query time entries for matched UUIDs
        query = self.db.query(JibbleTimeEntry).filter(
            JibbleTimeEntry.person_id.in_(list(trainer_by_uuid.keys()))
        )
        
        if start_date:
            query = query.filter(JibbleTimeEntry.entry_date >= start_date)
        if end_date:
            query = query.filter(JibbleTimeEntry.entry_date <= end_date)
        
        entries = query.all()
        
        results = []
        for entry in entries:
            trainer = trainer_by_uuid.get(entry.person_id)
            if trainer:
                results.append({
                    "trainer_email": trainer.trainer_email,
                    "trainer_name": trainer.trainer_name or trainer.jibble_name,
                    "date": entry.entry_date.isoformat() if entry.entry_date else None,
                    "hours": entry.total_hours or 0,
                    "pod_lead": trainer.pod_lead_email,
                    "status": trainer.current_status,
                    "jibble_name": trainer.jibble_name,
                })
        
        logger.info(f"Found {len(results)} time entries for {len(set(e['trainer_email'] for e in results))} trainers")
        return results
    
    def full_sync(self) -> Dict:
        """Perform a full sync of Jibble data"""
        try:
            logger.info("Step 1: Syncing people from Jibble...")
            people_count = self.sync_people()
            
            logger.info("Step 2: Syncing time entries for current month...")
            month_details = self.sync_time_entries_for_month()
            
            return {
                "success": True,
                "people_synced": people_count,
                "time_entries_synced": month_details.get("entries", 0),
                "month_synced": month_details,
                "error": None,
            }
            
        except Exception as e:
            logger.error(f"Full sync failed: {e}")
            return {
                "success": False,
                "people_synced": 0,
                "time_entries_synced": 0,
                "month_synced": None,
                "error": str(e),
            }
