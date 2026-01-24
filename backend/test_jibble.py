#!/usr/bin/env python3
"""
Jibble API - Fetch Nvidia - SysBench project data
"""

import requests
import json
from datetime import datetime, timedelta
from collections import defaultdict

# Jibble API credentials
JIBBLE_API_KEY = "338a66b4-195e-4f5e-b047-65fb174b5e0c"
JIBBLE_API_SECRET = "m6c9uybknR7nh0ZFKAuQS5EvzgF7UySppQTPeNZibZaLcBv8"

WORKSPACE_URL = "https://workspace.prod.jibble.io"
TIMEATTENDANCE_URL = "https://time-attendance.prod.jibble.io"

PROJECT_ID = "a7b4596c-b632-49ce-bada-33df4491edd2"
PROJECT_NAME = "Nvidia - SysBench"

def get_access_token():
    """Get access token"""
    url = "https://identity.prod.jibble.io/connect/token"
    data = {
        "grant_type": "client_credentials",
        "client_id": JIBBLE_API_KEY,
        "client_secret": JIBBLE_API_SECRET,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    response = requests.post(url, data=data, headers=headers)
    if response.status_code == 200:
        return response.json().get("access_token")
    return None

def get_project_assignees(token, project_id):
    """Try different methods to get project assignees"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    # Method 1: ProjectAssignees endpoint
    endpoints = [
        f"{WORKSPACE_URL}/v1/ProjectAssignees?$filter=projectId eq '{project_id}'",
        f"{WORKSPACE_URL}/v1/ProjectAssignments?$filter=projectId eq '{project_id}'",
        f"{WORKSPACE_URL}/v1/Projects('{project_id}')/Assignees",
        f"{WORKSPACE_URL}/v1/Projects/{project_id}/assignees",
        f"{WORKSPACE_URL}/v1/People?$filter=projectIds/any(p: p eq '{project_id}')",
    ]
    
    for url in endpoints:
        print(f"  Trying: {url}")
        try:
            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                print(f"  ✓ Success!")
                return data
            else:
                print(f"  {response.status_code}")
        except Exception as e:
            print(f"  Error: {e}")
    
    return None

def get_all_people(token):
    """Get all people in the organization"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    all_people = []
    url = f"{WORKSPACE_URL}/v1/People?$top=1000&$expand=user"
    
    while url:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            data = response.json()
            people = data.get('value', [])
            all_people.extend(people)
            url = data.get('@odata.nextLink')
        else:
            break
    
    return all_people

def get_all_users(token):
    """Get all users with details"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    all_users = []
    url = f"{WORKSPACE_URL}/v1/Users?$top=1000"
    
    while url:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            data = response.json()
            users = data.get('value', [])
            all_users.extend(users)
            url = data.get('@odata.nextLink')
        else:
            break
    
    return all_users

def get_timesheets_with_project(token, project_id, start_date, end_date):
    """Get all timesheets and filter by project activities"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    results = []
    current = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        url = f"{TIMEATTENDANCE_URL}/v1/Timesheets?Date={date_str}&$expand=activities"
        
        try:
            response = requests.get(url, headers=headers, timeout=120)
            if response.status_code == 200:
                data = response.json()
                timesheets = data.get('value', [])
                
                count = 0
                for ts in timesheets:
                    # Check if any activity is for our project
                    activities = ts.get('activities', [])
                    project_activities = [a for a in activities if a.get('projectId') == project_id]
                    
                    if project_activities:
                        ts['_date'] = date_str
                        ts['_project_activities'] = project_activities
                        results.append(ts)
                        count += 1
                
                print(f"  {date_str}: {count} timesheets with project activities")
            else:
                # Try without expand
                url2 = f"{TIMEATTENDANCE_URL}/v1/Timesheets?Date={date_str}"
                response2 = requests.get(url2, headers=headers, timeout=120)
                if response2.status_code == 200:
                    print(f"  {date_str}: Got timesheets (no activities)")
        except Exception as e:
            print(f"  {date_str}: Error - {e}")
        
        current += timedelta(days=1)
    
    return results

def get_activities_for_project(token, project_id, start_date, end_date):
    """Get activities filtered by project"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    results = []
    current = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        
        # Try direct activities endpoint
        urls = [
            f"{TIMEATTENDANCE_URL}/v1/Activities?Date={date_str}&$filter=projectId eq '{project_id}'",
            f"{TIMEATTENDANCE_URL}/v1/Activities?$filter=date eq {date_str} and projectId eq '{project_id}'",
        ]
        
        for url in urls:
            try:
                response = requests.get(url, headers=headers, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    activities = data.get('value', [])
                    if activities:
                        for a in activities:
                            a['_date'] = date_str
                        results.extend(activities)
                        print(f"  {date_str}: Found {len(activities)} activities")
                        break
            except:
                pass
        
        current += timedelta(days=1)
    
    return results

def parse_duration(duration_str):
    """Parse ISO 8601 duration to hours"""
    if not duration_str or duration_str == "PT0S":
        return 0
    
    hours = 0
    minutes = 0
    seconds = 0
    
    duration_str = duration_str.replace("PT", "")
    
    if "H" in duration_str:
        h_idx = duration_str.index("H")
        hours = int(duration_str[:h_idx])
        duration_str = duration_str[h_idx+1:]
    
    if "M" in duration_str:
        m_idx = duration_str.index("M")
        minutes = int(duration_str[:m_idx])
        duration_str = duration_str[m_idx+1:]
    
    if "S" in duration_str:
        s_idx = duration_str.index("S")
        try:
            seconds = float(duration_str[:s_idx])
        except:
            seconds = 0
    
    return hours + minutes/60 + seconds/3600

def main():
    print("=" * 80)
    print(f"JIBBLE - '{PROJECT_NAME}' Daily Hours")
    print("=" * 80)
    
    # Get token
    print("\n🔑 Getting access token...")
    token = get_access_token()
    if not token:
        print("Failed!")
        return
    print("✓ Got token")
    
    # Try to get project assignees
    print(f"\n👥 Getting assignees for project...")
    assignees = get_project_assignees(token, PROJECT_ID)
    
    if assignees:
        print(json.dumps(assignees, indent=2, default=str)[:2000])
    
    # Get all users for mapping
    print("\n📋 Getting all users...")
    users = get_all_users(token)
    user_map = {u.get('id'): u for u in users}
    print(f"Found {len(users)} users")
    
    # Get all people
    print("\n👤 Getting all people...")
    people = get_all_people(token)
    print(f"Found {len(people)} people")
    
    # Create person to user mapping
    person_to_name = {}
    for p in people:
        pid = p.get('id')
        user = p.get('user', {})
        name = user.get('fullName') or p.get('fullName')
        email = user.get('email') or p.get('email')
        if name or email:
            person_to_name[pid] = name or email
    
    # Date range - last 14 days
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
    
    # Get activities for project
    print(f"\n⏱️ Getting activities from {start_date} to {end_date}...")
    activities = get_activities_for_project(token, PROJECT_ID, start_date, end_date)
    
    if activities:
        print(f"\n✅ Found {len(activities)} activities for the project")
        
        # Aggregate by person and date
        person_hours = defaultdict(lambda: defaultdict(float))
        
        for a in activities:
            person_id = a.get('personId')
            date = a.get('_date', a.get('date', ''))[:10]
            duration = a.get('duration', 0)
            
            # Duration might be in seconds or as ISO 8601
            if isinstance(duration, str):
                hours = parse_duration(duration)
            else:
                hours = duration / 3600 if duration > 60 else duration / 60
            
            person_hours[person_id][date] += hours
        
        # Print results
        print("\n" + "=" * 80)
        print("DAILY HOURS BY PERSON")
        print("=" * 80)
        print(f"\n{'Person':<40} | {'Date':<12} | {'Hours':>8}")
        print("-" * 65)
        
        for person_id in sorted(person_hours.keys(), key=lambda x: person_to_name.get(x, x)):
            name = person_to_name.get(person_id, person_id[:20] + "...")
            for date in sorted(person_hours[person_id].keys()):
                hours = person_hours[person_id][date]
                if hours > 0:
                    print(f"{name[:40]:<40} | {date:<12} | {hours:>7.2f}h")
        
        # Summary
        print("\n" + "=" * 80)
        print("TOTAL HOURS BY PERSON")
        print("=" * 80)
        
        totals = []
        for person_id, dates in person_hours.items():
            total = sum(dates.values())
            totals.append((person_to_name.get(person_id, person_id), total))
        
        totals.sort(key=lambda x: -x[1])
        
        for name, total in totals[:30]:
            print(f"{name[:50]:<50} | {total:>7.2f}h")
        
        if len(totals) > 30:
            print(f"... and {len(totals) - 30} more people")
    else:
        print("\n⚠️ No activities found for this project")
        
        # Try getting timesheets with activities
        print("\n🔄 Trying timesheets with activities...")
        timesheets = get_timesheets_with_project(token, PROJECT_ID, start_date, end_date)
        
        if timesheets:
            print(f"Found {len(timesheets)} timesheets with project activities")
            print(json.dumps(timesheets[:2], indent=2, default=str)[:3000])

if __name__ == "__main__":
    main()
