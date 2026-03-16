"""
Service for reading and serving quality rubrics data.

Supports two data sources:
- Google Sheet (legacy, for test projects)
- BigQuery (for live projects like project 60)

Both paths return the same response shape so the frontend works without changes.
"""
import os
import json
import time
import logging
from collections import defaultdict
from typing import Any
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 300  # 5 minutes

BIGQUERY_PROJECT_IDS = {60}

# Maps additional_data JSON keys to human-readable names and their
# associated text-explanation keys (used as feedback/reasons).
ADDITIONAL_INFO_FIELDS: list[dict[str, str | None]] = [
    {"key": "globalScoreCorrect", "name": "Global score is correct", "reason_key": "reasonGlobalScoreIncorrect"},
    {"key": "majorMinorLabelCorrect", "name": "Major vs Minor label at issue level is correct", "reason_key": "reasonMajorMinorIncorrect"},
    {"key": "allIssuesAddressed", "name": "Have all issues been addressed up to Major issue", "reason_key": "explainMissingIssue"},
    {"key": "stopAfterFirstMajor", "name": "Stop after the first Major issue", "reason_key": None},
    {"key": "issuesInRightOrder", "name": "Issues are in the right order [top to bottom]", "reason_key": "justificationForOrder"},
    {"key": "minorIssueHasWorkableFix", "name": "Each minor issue has a workable fix", "reason_key": "explainWorkableFix"},
    {"key": "workableFixCorrect", "name": "Is the workable fix correct or incorrect?", "reason_key": "incorrectWorkableFixIssueIds"},
    {"key": "issuesMathematicallySound", "name": "Issues are mathematically sound", "reason_key": "reasonsMathematicallySound"},
    {"key": "outputFieldsComplete", "name": "Output fields are complete", "reason_key": None},
    {"key": "issueDescriptionsIdentifyWhere", "name": "Issue descriptions identify where in the proof,  the issue occurred", "reason_key": None},
    {"key": "issueDescriptionsPrecise", "name": "Issue descriptions are precise, without ambiguous language", "reason_key": "explanationAmbiguity"},
]

# Standalone text field not tied to a boolean; attached as a general note
_STANDALONE_TEXT_KEY = "explanationAgreementDisagreement"

RUBRIC_CATEGORIES = [
    {
        "name": "Labeling Accuracy",
        "items": [
            "Global score is correct",
            "Major vs Minor label at issue level is correct",
            "Have all issues been addressed up to Major issue",
        ],
    },
    {
        "name": "Step coverage and discipline",
        "items": [
            "Stop after the first Major issue",
            "Issues are in the right order [top to bottom]",
            "Each minor issue has a workable fix",
            "Is the workable fix correct or incorrect?",
        ],
    },
    {
        "name": "Failure resolution quality",
        "items": [
            "Issues are mathematically sound",
            "Output fields are complete",
        ],
    },
    {
        "name": "Mathematical Correctness of Critique",
        "items": [
            "Issue descriptions identify where in the proof,  the issue occurred",
            "Issue descriptions are precise, without ambiguous language",
        ],
    },
]

ALL_RUBRIC_ITEMS = [item for cat in RUBRIC_CATEGORIES for item in cat["items"]]

_RUBRIC_ITEM_LOOKUP: dict[str, str] = {}
for item in ALL_RUBRIC_ITEMS:
    _RUBRIC_ITEM_LOOKUP[item.strip().lower()] = item

# BigQuery quality_dimension.name → our RUBRIC_CATEGORIES name (case-insensitive keys)
_BQ_DIM_TO_CATEGORY: dict[str, str] = {
    "labeling accuracy": "Labeling Accuracy",
    "step coverage and review discipline": "Step coverage and discipline",
    "failure resolution quality": "Failure resolution quality",
    "critique precision and output completeness": "Mathematical Correctness of Critique",
}


def _normalize_header(h: str) -> str:
    return h.strip().lower()


def _match_rubric_item(header: str) -> str | None:
    """Try to match a column header to a known rubric PASS/FAIL item."""
    norm = _normalize_header(header)
    if norm in _RUBRIC_ITEM_LOOKUP:
        return _RUBRIC_ITEM_LOOKUP[norm]
    for key, val in _RUBRIC_ITEM_LOOKUP.items():
        if norm.startswith(key[:30]) or key.startswith(norm[:30]):
            return val
    return None


class QualityRubricsService:
    """Reads quality rubrics data from Google Sheets or BigQuery with caching."""

    def __init__(self):
        self._cache: dict[str, dict[str, Any]] = {}
        self._cache_times: dict[str, float] = {}
        self._bq_client = None

    # ------------------------------------------------------------------
    # Google Sheet credentials
    # ------------------------------------------------------------------

    def _get_credentials(self):
        load_dotenv()
        from google.oauth2.service_account import Credentials

        credentials_dict = {
            "type": os.environ.get("GOOGLE_SERVICE_ACCOUNT_TYPE", "service_account"),
            "project_id": os.environ.get("GOOGLE_PROJECT_ID"),
            "private_key_id": os.environ.get("GOOGLE_PRIVATE_KEY_ID"),
            "private_key": os.environ.get("GOOGLE_PRIVATE_KEY", "").replace("\\n", "\n"),
            "client_email": os.environ.get("GOOGLE_CLIENT_EMAIL"),
            "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
            "auth_uri": os.environ.get("GOOGLE_AUTH_URI", "https://accounts.google.com/o/oauth2/auth"),
            "token_uri": os.environ.get("GOOGLE_TOKEN_URI", "https://oauth2.googleapis.com/token"),
            "auth_provider_x509_cert_url": os.environ.get("GOOGLE_AUTH_PROVIDER_CERT_URL", "https://www.googleapis.com/oauth2/v1/certs"),
            "client_x509_cert_url": os.environ.get("GOOGLE_CLIENT_CERT_URL"),
            "universe_domain": os.environ.get("GOOGLE_UNIVERSE_DOMAIN", "googleapis.com"),
        }

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
        ]
        return Credentials.from_service_account_info(credentials_dict, scopes=scopes)

    # ------------------------------------------------------------------
    # Team structure: email → "reviewer" | "calibrator"
    # ------------------------------------------------------------------

    _team_roles_cache: dict[str, str] | None = None
    _team_roles_cache_time: float = 0

    TEAM_SHEET_ID = "1jPoZeco1t7YaAOd0NJrzNIO3F_CfPBBMm3J3fxHfot8"

    def _fetch_team_roles(self) -> dict[str, str]:
        """Fetch Math Proof Eval team sheet and return email → role bucket mapping.

        Pod Lead / Sub Pod Lead           → "reviewer"
        Calibrator / Team Lead / Auditor  → "calibrator"
        Sheet cols A-C (indices 0-2): Email, Name, Role. Data from row 3.
        """
        now = time.time()
        if (
            self._team_roles_cache is not None
            and (now - self._team_roles_cache_time) < CACHE_TTL_SECONDS
        ):
            return self._team_roles_cache

        import gspread

        try:
            credentials = self._get_credentials()
            gc = gspread.authorize(credentials)
            spreadsheet = gc.open_by_key(self.TEAM_SHEET_ID)
            ws = spreadsheet.get_worksheet(0)
            rows = ws.get_all_values()
        except Exception as err:
            logger.error(f"Cannot access team sheet {self.TEAM_SHEET_ID}: {err}")
            self._team_roles_cache = {}
            self._team_roles_cache_time = now
            return {}

        REVIEWER_ROLES = {"pod lead", "sub pod lead"}
        CALIBRATOR_ROLES = {"calibrator", "auditor", "team lead"}

        roles: dict[str, str] = {}
        for row in rows[2:]:
            if len(row) < 3:
                continue
            email = (row[0] or "").strip().lower()
            role_raw = (row[2] or "").strip().lower()
            if not email or not role_raw:
                continue
            if role_raw in REVIEWER_ROLES:
                roles[email] = "reviewer"
            elif role_raw in CALIBRATOR_ROLES:
                roles[email] = "calibrator"

        logger.info(
            f"Team roles loaded: {sum(1 for v in roles.values() if v == 'reviewer')} reviewers, "
            f"{sum(1 for v in roles.values() if v == 'calibrator')} calibrators"
        )
        self._team_roles_cache = roles
        self._team_roles_cache_time = now
        return roles

    # ------------------------------------------------------------------
    # BigQuery client (lazy init)
    # ------------------------------------------------------------------

    def _get_bq_client(self):
        if self._bq_client is not None:
            return self._bq_client

        from google.cloud import bigquery
        from app.config import get_settings

        settings = get_settings()
        credentials_path = settings.google_application_credentials

        if credentials_path and os.path.exists(credentials_path):
            from google.oauth2 import service_account
            credentials = service_account.Credentials.from_service_account_file(credentials_path)
            self._bq_client = bigquery.Client(
                credentials=credentials,
                project=settings.gcp_project_id,
            )
        else:
            self._bq_client = bigquery.Client(project=settings.gcp_project_id)

        return self._bq_client

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def get_data(
        self,
        project_id: int | None = None,
        force_refresh: bool = False,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        """Return quality rubrics data from the appropriate source.

        - project_id in BIGQUERY_PROJECT_IDS -> BigQuery
        - otherwise -> Google Sheet (legacy, ignores date filters)
        """
        use_bigquery = project_id is not None and project_id in BIGQUERY_PROJECT_IDS
        date_suffix = f":{start_date}:{end_date}" if start_date or end_date else ""
        cache_key = f"bq:{project_id}{date_suffix}" if use_bigquery else "sheet"

        now = time.time()
        if (
            not force_refresh
            and cache_key in self._cache
            and (now - self._cache_times.get(cache_key, 0)) < CACHE_TTL_SECONDS
        ):
            return self._cache[cache_key]

        source_label = f"BigQuery (project {project_id})" if use_bigquery else "Google Sheet"
        logger.info(f"Fetching quality rubrics data from {source_label}...")

        try:
            data = (
                self._fetch_from_bigquery(project_id, start_date=start_date, end_date=end_date)
                if use_bigquery
                else self._fetch_and_parse()
            )
            self._cache[cache_key] = data
            self._cache_times[cache_key] = time.time()
            logger.info(f"Quality rubrics data from {source_label} cached successfully")
            return data
        except Exception as e:
            logger.error(f"Error fetching quality rubrics data from {source_label}: {e}")
            if cache_key in self._cache:
                logger.warning("Returning stale cache due to fetch error")
                return self._cache[cache_key]
            raise

    def _fetch_and_parse(self) -> dict[str, Any]:
        import gspread
        from app.config import get_settings

        settings = get_settings()
        sheet_id = settings.quality_rubrics_sheet_id

        credentials = self._get_credentials()
        gc = gspread.authorize(credentials)
        spreadsheet = gc.open_by_key(sheet_id)

        daily_rollup = self._parse_daily_rollup(spreadsheet)
        task_details = self._parse_details(spreadsheet)
        summary = self._parse_summary(spreadsheet)
        batch_quality = self._compute_batch_quality(task_details, summary)
        rubric_fpy = self._compute_rubric_fpy(task_details, summary)

        return {
            "daily_rollup": daily_rollup,
            "batch_quality": batch_quality,
            "rubric_fpy": rubric_fpy,
            "task_details": task_details,
            "rubric_categories": RUBRIC_CATEGORIES,
            "summary": summary,
        }

    # ------------------------------------------------------------------
    # Daily/Batch Quality Report sheet
    # ------------------------------------------------------------------

    def _parse_daily_rollup(self, spreadsheet) -> dict[str, Any]:
        ws = spreadsheet.worksheet("Daily/Batch Quality Report")
        rows = ws.get_all_values()

        def _find_row(label_prefix: str) -> list[str] | None:
            for r in rows:
                if r and r[0].strip().lower().startswith(label_prefix.lower()):
                    return r
            return None

        def _int(val: str) -> int:
            try:
                return int(val.strip().replace(",", ""))
            except (ValueError, AttributeError):
                return 0

        def _pct(val: str) -> float:
            try:
                return float(val.strip().replace("%", ""))
            except (ValueError, AttributeError):
                return 0.0

        annotations_row = _find_row("Total annotations completed")
        reviewed_row = _find_row("Total reviewed by L2")
        passed_row = _find_row("Total passed L2")
        flagged_row = _find_row("Total flagged for rework")
        calibrated_row = _find_row("Total calibrated")
        passed_cal_row = _find_row("Total Passed calibrator")
        failed_cal_row = _find_row("Total failed calibration")
        defects_row = _find_row("Total defects")
        high_row = _find_row("High Severity")
        medium_row = _find_row("Medium severity")
        ready_row = _find_row("Total ready to ship")
        reviewer_fpy_row = _find_row("Reviewer FPY")
        auditor_fpy_row = _find_row("Auditor FPY")
        status_row = _find_row("Overall Status")

        return {
            "total_annotations_l1": _int(annotations_row[1]) if annotations_row else 0,
            "total_reviewed_l2": _int(reviewed_row[1]) if reviewed_row else 0,
            "total_reviewed_l2_action": (reviewed_row[2].strip() if reviewed_row and len(reviewed_row) > 2 else ""),
            "total_passed_l2": _int(passed_row[1]) if passed_row else 0,
            "total_flagged_rework": _int(flagged_row[1]) if flagged_row else 0,
            "total_flagged_rework_action": (flagged_row[2].strip() if flagged_row and len(flagged_row) > 2 else ""),
            "total_calibrated": _int(calibrated_row[1]) if calibrated_row else 0,
            "passed_calibrator": _int(passed_cal_row[1]) if passed_cal_row else 0,
            "failed_calibration": _int(failed_cal_row[1]) if failed_cal_row else 0,
            "failed_calibration_action": (failed_cal_row[2].strip() if failed_cal_row and len(failed_cal_row) > 2 else ""),
            "total_defects": _int(defects_row[1]) if defects_row else 0,
            "high_severity": _int(high_row[1]) if high_row else 0,
            "medium_severity": _int(medium_row[1]) if medium_row else 0,
            "total_ready_to_ship": _int(ready_row[1]) if ready_row else 0,
            "reviewer_fpy": _pct(reviewer_fpy_row[1]) if reviewer_fpy_row else 0,
            "reviewer_fpy_action": (reviewer_fpy_row[2].strip() if reviewer_fpy_row and len(reviewer_fpy_row) > 2 else ""),
            "auditor_fpy": _pct(auditor_fpy_row[1]) if auditor_fpy_row else 0,
            "auditor_fpy_action": (auditor_fpy_row[2].strip() if auditor_fpy_row and len(auditor_fpy_row) > 2 else ""),
            "overall_status": (status_row[1].strip() if status_row else "Unknown"),
            "updated_date": (status_row[2].strip().replace("Updated Date:", "").strip() if status_row and len(status_row) > 2 else ""),
        }

    # ------------------------------------------------------------------
    # Summary sheet
    # ------------------------------------------------------------------

    def _parse_summary(self, spreadsheet) -> dict[str, Any]:
        """Parse the Summary tab to read batch list and any pre-filled FPY values."""
        try:
            ws = spreadsheet.worksheet("Summary")
        except Exception:
            logger.warning("Summary sheet not found")
            return {"batch_list": [], "batch_fpy": {}, "category_fpy": {}, "rubric_item_fpy": {}}

        rows = ws.get_all_values()

        def _pct(val: str) -> float | None:
            v = val.strip().replace("%", "")
            if not v:
                return None
            try:
                return float(v)
            except ValueError:
                return None

        # --- Left side: BATCH QUALITY (cols A-E) ---
        # Row 0: "BATCH QUALITY" header
        # Row 1: Column headers (Batch, Reviewer FPY%, Rework%, Auditor FPY%, Rework%)
        # Rows 2+: Batch names with optional FPY values
        batch_list: list[str] = []
        batch_fpy: dict[str, dict] = {}

        for row in rows[2:]:
            batch_name = row[0].strip() if len(row) > 0 else ""
            if not batch_name or batch_name.lower().startswith("fpy"):
                continue

            batch_list.append(batch_name)

            r_fpy = _pct(row[1]) if len(row) > 1 else None
            r_rework = _pct(row[2]) if len(row) > 2 else None
            a_fpy = _pct(row[3]) if len(row) > 3 else None
            a_rework = _pct(row[4]) if len(row) > 4 else None

            if any(v is not None for v in [r_fpy, r_rework, a_fpy, a_rework]):
                batch_fpy[batch_name] = {
                    "reviewer_to_trainer_fpy": r_fpy,
                    "reviewer_to_trainer_rework": r_rework,
                    "auditor_to_reviewer_fpy": a_fpy,
                    "auditor_to_trainer_rework": a_rework,
                }

        # --- Right side: QUALITY RUBRICS (cols G-K) ---
        # Two sub-sections:
        #   1. Category-level FPY (rows 2-5, col G = category name)
        #   2. Individual rubric-item FPY (rows 9-19, col G = rubric item name)
        # Both have the same metric columns (H-K): Reviewer FPY%, Rework%, Auditor FPY%, Rework%
        category_fpy: dict[str, dict] = {}
        rubric_item_fpy: dict[str, dict] = {}

        for row in rows[1:]:
            label = row[6].strip() if len(row) > 6 else ""
            if not label:
                continue

            r_fpy = _pct(row[7]) if len(row) > 7 else None
            r_rework = _pct(row[8]) if len(row) > 8 else None
            a_fpy = _pct(row[9]) if len(row) > 9 else None
            a_rework = _pct(row[10]) if len(row) > 10 else None

            entry = {
                "reviewer_to_trainer_fpy": r_fpy,
                "reviewer_to_trainer_rework": r_rework,
                "auditor_to_reviewer_fpy": a_fpy,
                "auditor_to_trainer_rework": a_rework,
            }

            has_values = any(v is not None for v in entry.values())

            # Determine if this is a category or individual rubric item
            is_category = label in [c["name"] for c in RUBRIC_CATEGORIES]
            is_rubric = _match_rubric_item(label) is not None

            if is_category:
                category_fpy[label] = entry if has_values else {}
            elif is_rubric:
                canonical = _match_rubric_item(label)
                rubric_item_fpy[canonical] = entry if has_values else {}

        logger.info(
            f"Summary: {len(batch_list)} batches, "
            f"{len(batch_fpy)} with FPY data, "
            f"{len(category_fpy)} categories, "
            f"{len(rubric_item_fpy)} rubric items"
        )

        return {
            "batch_list": batch_list,
            "batch_fpy": batch_fpy,
            "category_fpy": category_fpy,
            "rubric_item_fpy": rubric_item_fpy,
        }

    # ------------------------------------------------------------------
    # Details sheet
    # ------------------------------------------------------------------

    def _parse_details(self, spreadsheet) -> list[dict[str, Any]]:
        ws = spreadsheet.worksheet("Details")
        all_rows = ws.get_all_values()

        if len(all_rows) < 3:
            return []

        headers_row = all_rows[2]

        # Score column maps: rubric_item -> col_index
        reviewer_score_cols: dict[str, int] = {}
        auditor_score_cols: dict[str, int] = {}
        # Reason column maps: rubric_item -> list of (col_index, column_header_name)
        reviewer_reason_cols: dict[str, list[tuple[int, str]]] = {}
        auditor_reason_cols: dict[str, list[tuple[int, str]]] = {}

        first_global_idx = None
        second_global_idx = None
        for idx, h in enumerate(headers_row):
            if _normalize_header(h).startswith("global score is correct"):
                if first_global_idx is None:
                    first_global_idx = idx
                else:
                    second_global_idx = idx
                    break

        if first_global_idx is None:
            logger.warning("Could not find rubric columns in Details sheet")
            return []

        auditor_start = second_global_idx if second_global_idx else len(headers_row)

        self._map_rubric_columns(
            headers_row, first_global_idx, auditor_start,
            reviewer_score_cols, reviewer_reason_cols,
        )

        if second_global_idx:
            self._map_rubric_columns(
                headers_row, auditor_start, len(headers_row),
                auditor_score_cols, auditor_reason_cols,
            )

        results: list[dict[str, Any]] = []
        for row in all_rows[3:]:
            batch = row[0].strip() if len(row) > 0 else ""
            task = row[1].strip() if len(row) > 1 else ""
            task_link = row[2].strip() if len(row) > 2 else ""

            if not batch and not task:
                continue

            has_data = False

            reviewer_scores: dict[str, str] = {}
            reviewer_reasons: dict[str, list[dict[str, str]]] = {}
            for rubric_item, col_idx in reviewer_score_cols.items():
                val = row[col_idx].strip() if col_idx < len(row) else ""
                reviewer_scores[rubric_item] = val
                if val:
                    has_data = True
            for rubric_item, col_list in reviewer_reason_cols.items():
                reasons = []
                for col_idx, col_header in col_list:
                    text = row[col_idx].strip() if col_idx < len(row) else ""
                    if text:
                        reasons.append({"label": col_header, "text": text})
                reviewer_reasons[rubric_item] = reasons

            auditor_scores: dict[str, str] = {}
            auditor_reasons: dict[str, list[dict[str, str]]] = {}
            for rubric_item, col_idx in auditor_score_cols.items():
                val = row[col_idx].strip() if col_idx < len(row) else ""
                auditor_scores[rubric_item] = val
                if val:
                    has_data = True
            for rubric_item, col_list in auditor_reason_cols.items():
                reasons = []
                for col_idx, col_header in col_list:
                    text = row[col_idx].strip() if col_idx < len(row) else ""
                    if text:
                        reasons.append({"label": col_header, "text": text})
                auditor_reasons[rubric_item] = reasons

            results.append({
                "batch": batch,
                "task": task,
                "task_link": task_link,
                "has_data": has_data,
                "reviewer": {"scores": reviewer_scores, "reasons": reviewer_reasons},
                "auditor": {"scores": auditor_scores, "reasons": auditor_reasons},
            })

        logger.info(f"Parsed {len(results)} task detail rows from sheet")
        return results

    def _map_rubric_columns(
        self,
        headers: list[str],
        start: int,
        end: int,
        score_cols: dict[str, int],
        reason_cols: dict[str, list[tuple[int, str]]],
    ):
        """
        Walk through columns from start to end, identifying PASS/FAIL rubric
        columns vs reason/explanation text columns.

        Captures ALL reason columns per rubric item with their original header names.
        """
        current_rubric: str | None = None

        for idx in range(start, end):
            h = headers[idx].strip()
            if not h:
                continue

            matched = _match_rubric_item(h)
            if matched:
                score_cols[matched] = idx
                current_rubric = matched
                if current_rubric not in reason_cols:
                    reason_cols[current_rubric] = []
            elif current_rubric:
                reason_cols[current_rubric].append((idx, h))

    # ------------------------------------------------------------------
    # Computed aggregates
    # ------------------------------------------------------------------

    def _compute_batch_quality(
        self,
        task_details: list[dict],
        summary: dict[str, Any],
    ) -> list[dict]:
        """
        Build batch quality table. Uses Summary tab's batch list as the
        canonical list, then fills in computed FPY from Details data.
        If the Summary tab has pre-filled FPY values, those take priority.
        """
        batches_from_details: dict[str, list[dict]] = defaultdict(list)
        for td in task_details:
            if td["has_data"]:
                batches_from_details[td["batch"]].append(td)

        batch_list = summary.get("batch_list", [])
        summary_fpy = summary.get("batch_fpy", {})

        # Combine: all batches from Summary + any extra from Details
        all_batch_names = list(batch_list)
        for bname in batches_from_details:
            if bname not in all_batch_names:
                all_batch_names.append(bname)

        results = []
        for batch_name in all_batch_names:
            # Check if Summary tab has pre-filled values
            if batch_name in summary_fpy and any(
                v is not None for v in summary_fpy[batch_name].values()
            ):
                entry = summary_fpy[batch_name]
                results.append({
                    "batch": batch_name,
                    "reviewer_to_trainer_fpy": entry.get("reviewer_to_trainer_fpy"),
                    "reviewer_to_trainer_rework": entry.get("reviewer_to_trainer_rework"),
                    "auditor_to_reviewer_fpy": entry.get("auditor_to_reviewer_fpy"),
                    "auditor_to_trainer_rework": entry.get("auditor_to_trainer_rework"),
                    "source": "sheet",
                    "task_count": len(batches_from_details.get(batch_name, [])),
                })
            elif batch_name in batches_from_details:
                tasks = batches_from_details[batch_name]
                reviewer_tasks = [t for t in tasks if any(v.strip() for v in t["reviewer"]["scores"].values())]
                auditor_tasks = [t for t in tasks if any(v.strip() for v in t["auditor"]["scores"].values())]

                reviewer_passed = sum(
                    1 for t in reviewer_tasks
                    if all(v.upper() == "PASS" for v in t["reviewer"]["scores"].values() if v.strip())
                )
                auditor_passed = sum(
                    1 for t in auditor_tasks
                    if all(v.upper() == "PASS" for v in t["auditor"]["scores"].values() if v.strip())
                )

                r_total = len(reviewer_tasks)
                a_total = len(auditor_tasks)
                results.append({
                    "batch": batch_name,
                    "reviewer_to_trainer_fpy": round(reviewer_passed / r_total * 100, 1) if r_total else None,
                    "reviewer_to_trainer_rework": round((r_total - reviewer_passed) / r_total * 100, 1) if r_total else None,
                    "auditor_to_reviewer_fpy": round(auditor_passed / a_total * 100, 1) if a_total else None,
                    "auditor_to_trainer_rework": round((a_total - auditor_passed) / a_total * 100, 1) if a_total else None,
                    "source": "computed",
                    "task_count": len(tasks),
                })
            else:
                results.append({
                    "batch": batch_name,
                    "reviewer_to_trainer_fpy": None,
                    "reviewer_to_trainer_rework": None,
                    "auditor_to_reviewer_fpy": None,
                    "auditor_to_trainer_rework": None,
                    "source": "pending",
                    "task_count": 0,
                })

        return results

    def _compute_rubric_fpy(
        self,
        task_details: list[dict],
        summary: dict[str, Any],
    ) -> list[dict]:
        """
        Compute per-rubric-item FPY% across all tasks.
        If Summary tab has pre-filled values, use those instead.
        Also includes category-level FPY from the Summary tab.
        """
        tasks_with_data = [t for t in task_details if t["has_data"]]
        summary_rubric_fpy = summary.get("rubric_item_fpy", {})
        summary_category_fpy = summary.get("category_fpy", {})

        results = []
        for cat in RUBRIC_CATEGORIES:
            # Category-level summary from the Summary tab
            cat_entry = summary_category_fpy.get(cat["name"], {})
            results.append({
                "rubric_item": cat["name"],
                "category": cat["name"],
                "is_category_summary": True,
                "reviewer_fpy": cat_entry.get("reviewer_to_trainer_fpy"),
                "reviewer_rework": cat_entry.get("reviewer_to_trainer_rework"),
                "auditor_fpy": cat_entry.get("auditor_to_reviewer_fpy"),
                "auditor_rework": cat_entry.get("auditor_to_trainer_rework"),
                "source": "sheet" if cat_entry else "pending",
            })

            for item in cat["items"]:
                # Check if Summary tab has pre-filled values for this rubric item
                summary_entry = summary_rubric_fpy.get(item, {})
                if summary_entry and any(v is not None for v in summary_entry.values()):
                    results.append({
                        "rubric_item": item,
                        "category": cat["name"],
                        "is_category_summary": False,
                        "reviewer_fpy": summary_entry.get("reviewer_to_trainer_fpy"),
                        "reviewer_rework": summary_entry.get("reviewer_to_trainer_rework"),
                        "auditor_fpy": summary_entry.get("auditor_to_reviewer_fpy"),
                        "auditor_rework": summary_entry.get("auditor_to_trainer_rework"),
                        "source": "sheet",
                    })
                else:
                    reviewer_total = 0
                    reviewer_pass = 0
                    auditor_total = 0
                    auditor_pass = 0

                    for t in tasks_with_data:
                        rv = t["reviewer"]["scores"].get(item, "").strip().upper()
                        if rv:
                            reviewer_total += 1
                            if rv == "PASS":
                                reviewer_pass += 1

                        av = t["auditor"]["scores"].get(item, "").strip().upper()
                        if av:
                            auditor_total += 1
                            if av == "PASS":
                                auditor_pass += 1

                    r_fpy = round(reviewer_pass / reviewer_total * 100, 1) if reviewer_total else None
                    r_rework = round(100 - r_fpy, 1) if r_fpy is not None else None
                    a_fpy = round(auditor_pass / auditor_total * 100, 1) if auditor_total else None
                    a_rework = round(100 - a_fpy, 1) if a_fpy is not None else None

                    results.append({
                        "rubric_item": item,
                        "category": cat["name"],
                        "is_category_summary": False,
                        "reviewer_fpy": r_fpy,
                        "reviewer_rework": r_rework,
                        "auditor_fpy": a_fpy,
                        "auditor_rework": a_rework,
                        "source": "computed",
                    })

        return results

    # ==================================================================
    # BigQuery-based data fetching (for live projects like 60)
    # ==================================================================

    @staticmethod
    def _score_to_label(
        score: float | None,
        score_text: str | None,
        review_display: dict | str | None,
    ) -> str:
        """Convert a BigQuery QDV score into a human-readable label.

        BOOLEAN_CHOICE rubrics -> "Pass" / "Fail"
        STAR_RATING rubrics   -> numeric string like "4.5"
        """
        if review_display and isinstance(review_display, str):
            review_display = json.loads(review_display)

        display_type = (review_display or {}).get("type", "STAR_RATING")

        if display_type == "BOOLEAN_CHOICE":
            if score_text and score_text.strip().upper() in ("PASS", "FAIL"):
                return score_text.strip().capitalize()
            if score is not None:
                return "Pass" if score >= 5.0 else "Fail"
            return ""

        # STAR_RATING or unknown
        if score is not None:
            return str(int(score)) if score == int(score) else str(score)
        return ""

    @staticmethod
    def _date_filter_sql(alias: str, start_date: str | None, end_date: str | None) -> str:
        """Build SQL date-filter clauses on ``<alias>.created_at``."""
        parts: list[str] = []
        if start_date:
            parts.append(f"AND {alias}.created_at >= '{start_date}'")
        if end_date:
            parts.append(f"AND {alias}.created_at < DATE_ADD('{end_date}', INTERVAL 1 DAY)")
        return "\n          ".join(parts)

    def _build_conversations_query(
        self, project_id: int, start_date: str | None = None, end_date: str | None = None,
    ) -> str:
        """Fetch all reviewed conversations (completed, validated, or rework) with batch info."""
        from app.config import get_settings

        s = get_settings()
        p, d = s.gcp_project_id, s.bigquery_dataset

        date_filter = self._date_filter_sql("c", start_date, end_date)
        return f"""
        SELECT
            c.id AS conversation_id,
            c.colab_link,
            c.title,
            b.name AS batch_name
        FROM `{p}.{d}.conversation` c
        LEFT JOIN `{p}.{d}.batch` b ON b.id = c.batch_id
        WHERE c.project_id = {project_id}
          AND c.status IN ('completed', 'validated', 'rework')
          {date_filter}
        """

    def _build_additional_data_query(
        self, project_id: int, start_date: str | None = None, end_date: str | None = None,
    ) -> str:
        """Query to fetch review.additional_data for both the latest and first review per conversation.

        Returns rows where rn=1 (latest) and rn=total_reviews (first).
        When only one review exists, a single row has rn=1 and total_reviews=1.
        """
        from app.config import get_settings

        s = get_settings()
        p, d = s.gcp_project_id, s.bigquery_dataset

        date_filter = self._date_filter_sql("c", start_date, end_date)
        return f"""
        WITH ranked AS (
            SELECT
                r.conversation_id,
                r.audit,
                r.reviewer_id,
                TO_JSON_STRING(r.additional_data) AS additional_data_json,
                ROW_NUMBER() OVER (
                    PARTITION BY r.conversation_id, r.audit
                    ORDER BY r.id DESC
                ) AS rn,
                COUNT(*) OVER (
                    PARTITION BY r.conversation_id, r.audit
                ) AS total_reviews
            FROM `{p}.{d}.review` r
            JOIN `{p}.{d}.conversation` c ON c.id = r.conversation_id
            WHERE c.project_id = {project_id}
              AND r.review_type = 'manual'
              AND r.status = 'published'
              {date_filter}
        )
        SELECT ranked.conversation_id, ranked.audit, ranked.additional_data_json,
               cont.turing_email AS reviewer_email,
               ranked.rn, ranked.total_reviews
        FROM ranked
        LEFT JOIN `{p}.{d}.contributor` cont ON cont.id = ranked.reviewer_id
        WHERE ranked.rn = 1 OR ranked.rn = ranked.total_reviews
        """

    def _build_quality_dimensions_query(
        self, project_id: int, start_date: str | None = None, end_date: str | None = None,
    ) -> str:
        """Fetch quality dimension Pass/Fail for both the latest and first review per conversation.

        Used as a fallback when review.additional_data is NULL but quality
        dimension scores exist.
        """
        from app.config import get_settings

        s = get_settings()
        p, d = s.gcp_project_id, s.bigquery_dataset

        date_filter = self._date_filter_sql("c", start_date, end_date)
        return f"""
        WITH ranked_review AS (
            SELECT
                r.id AS review_id,
                r.conversation_id,
                r.audit,
                r.reviewer_id,
                ROW_NUMBER() OVER (
                    PARTITION BY r.conversation_id, r.audit
                    ORDER BY r.id DESC
                ) AS rn,
                COUNT(*) OVER (
                    PARTITION BY r.conversation_id, r.audit
                ) AS total_reviews
            FROM `{p}.{d}.review` r
            JOIN `{p}.{d}.conversation` c ON c.id = r.conversation_id
            WHERE c.project_id = {project_id}
              AND r.review_type = 'manual'
              AND r.status = 'published'
              {date_filter}
        )
        SELECT
            rr.conversation_id,
            rr.audit,
            qd.name AS dimension_name,
            rqdv.score_text,
            rqdv.score,
            cont.turing_email AS reviewer_email,
            rr.rn,
            rr.total_reviews
        FROM ranked_review rr
        JOIN `{p}.{d}.review_quality_dimension_value` rqdv ON rqdv.review_id = rr.review_id
        JOIN `{p}.{d}.quality_dimension` qd ON qd.id = rqdv.quality_dimension_id
        LEFT JOIN `{p}.{d}.contributor` cont ON cont.id = rr.reviewer_id
        WHERE rr.rn = 1 OR rr.rn = rr.total_reviews
        """

    def _resolve_role_bucket(
        self,
        reviewer_email: str | None,
        audit: int | None,
        team_roles: dict[str, str],
    ) -> str:
        """Determine whether a review belongs to 'reviewer' or 'calibrator'.

        Priority: sheet role > BigQuery audit flag > default to 'reviewer'.
        """
        if reviewer_email:
            bucket = team_roles.get(reviewer_email.lower())
            if bucket:
                return bucket
        if audit == 1:
            return "calibrator"
        return "reviewer"

    def _fetch_from_bigquery(
        self,
        project_id: int,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        """Fetch rubrics data from BigQuery matching prod structure.

        Prod shows 4 categories with 11 items (all from review.additional_data).
        Quality dimension scores are category-level and not shown as table columns.
        """
        client = self._get_bq_client()

        rubric_categories = list(RUBRIC_CATEGORIES)

        team_roles = self._fetch_team_roles()

        # 1. Fetch all conversations for this project
        conv_query = self._build_conversations_query(project_id, start_date, end_date)
        conv_rows = [dict(r) for r in client.query(conv_query).result()]

        conv_map: dict[int, dict[str, Any]] = {}
        for row in conv_rows:
            cid = row["conversation_id"]
            conv_map[cid] = {
                "conversation_id": cid,
                "colab_link": row.get("colab_link") or "",
                "title": row.get("title") or "",
                "batch_name": row.get("batch_name") or "",
                "reviewer_scores": {},
                "reviewer_reasons": {},
                "auditor_scores": {},
                "auditor_reasons": {},
                "first_reviewer_scores": {},
                "first_reviewer_reasons": {},
                "first_auditor_scores": {},
                "first_auditor_reasons": {},
                "reviewer_review_count": 0,
                "auditor_review_count": 0,
            }

        logger.info(f"Found {len(conv_map)} conversations for project {project_id}")

        # 2. Fetch additional_data (the actual rubric items shown on prod)
        ad_query = self._build_additional_data_query(project_id, start_date, end_date)
        ad_rows = [dict(r) for r in client.query(ad_query).result()]
        logger.info(f"BigQuery returned {len(ad_rows)} additional_data rows for project {project_id}")

        for ad_row in ad_rows:
            cid = ad_row["conversation_id"]
            if cid not in conv_map:
                continue

            rn = ad_row.get("rn", 1)
            total_reviews = ad_row.get("total_reviews", 1)

            bucket = self._resolve_role_bucket(
                ad_row.get("reviewer_email"), ad_row.get("audit"), team_roles,
            )

            is_latest = (rn == 1)
            is_first = (rn == total_reviews)

            if bucket == "calibrator":
                count_key = "auditor_review_count"
                latest_scores_key = "auditor_scores"
                latest_reasons_key = "auditor_reasons"
                first_scores_key = "first_auditor_scores"
                first_reasons_key = "first_auditor_reasons"
            else:
                count_key = "reviewer_review_count"
                latest_scores_key = "reviewer_scores"
                latest_reasons_key = "reviewer_reasons"
                first_scores_key = "first_reviewer_scores"
                first_reasons_key = "first_reviewer_reasons"

            if is_latest:
                conv_map[cid][count_key] = max(conv_map[cid][count_key], total_reviews)

            ad_json = ad_row.get("additional_data_json")
            if not ad_json:
                continue

            ad = json.loads(ad_json)

            targets = []
            if is_latest:
                targets.append((conv_map[cid][latest_scores_key], conv_map[cid][latest_reasons_key]))
            if is_first:
                targets.append((conv_map[cid][first_scores_key], conv_map[cid][first_reasons_key]))

            for target_scores, target_reasons in targets:
                for field in ADDITIONAL_INFO_FIELDS:
                    val = ad.get(field["key"])
                    if val is None:
                        continue
                    target_scores[field["name"]] = "Pass" if val is True else ("Fail" if val is False else str(val))

                    reason_key = field.get("reason_key")
                    if reason_key:
                        reason_text = (ad.get(reason_key) or "").strip()
                        if reason_text and reason_text.upper() not in ("N/A", "N/A.", "NA"):
                            target_reasons.setdefault(field["name"], []).append(
                                {"label": reason_key, "text": reason_text}
                            )

                standalone = (ad.get(_STANDALONE_TEXT_KEY) or "").strip()
                if standalone and standalone.upper() not in ("N/A", "NA"):
                    target_reasons.setdefault("Explanation Agreement", []).append(
                        {"label": "Agreement/Disagreement", "text": standalone}
                    )

        # 2b. Fallback: fetch quality dimension scores (manual reviews only)
        #     for conversations that have no additional_data.
        #     Sets all items in a category to the category-level Pass/Fail.
        cat_name_to_items: dict[str, list[str]] = {}
        for cat in RUBRIC_CATEGORIES:
            cat_name_to_items[cat["name"].lower()] = cat["items"]

        qd_query = self._build_quality_dimensions_query(project_id, start_date, end_date)
        try:
            qd_rows = [dict(r) for r in client.query(qd_query).result()]
            logger.info(f"BigQuery returned {len(qd_rows)} quality dimension rows for project {project_id}")
        except Exception as e:
            logger.warning(f"Quality dimension fallback query failed: {e}")
            qd_rows = []

        for qd_row in qd_rows:
            cid = qd_row["conversation_id"]
            if cid not in conv_map:
                continue

            rn = qd_row.get("rn", 1)
            total_reviews = qd_row.get("total_reviews", 1)

            bucket = self._resolve_role_bucket(
                qd_row.get("reviewer_email"), qd_row.get("audit"), team_roles,
            )

            is_latest = (rn == 1)
            is_first = (rn == total_reviews)

            if bucket == "calibrator":
                count_key = "auditor_review_count"
                latest_key = "auditor_scores"
                first_key = "first_auditor_scores"
            else:
                count_key = "reviewer_review_count"
                latest_key = "reviewer_scores"
                first_key = "first_reviewer_scores"

            if is_latest:
                conv_map[cid][count_key] = max(conv_map[cid][count_key], total_reviews)

            bq_dim_name = (qd_row.get("dimension_name") or "").strip()
            our_cat_name = _BQ_DIM_TO_CATEGORY.get(bq_dim_name.lower())
            if not our_cat_name:
                continue
            cat_items = cat_name_to_items.get(our_cat_name.lower(), [])
            if not cat_items:
                continue

            score_text = (qd_row.get("score_text") or "").strip()
            score_val = qd_row.get("score")
            if score_text.upper() in ("PASS", "FAIL"):
                pf = score_text.capitalize()
            elif score_val is not None:
                pf = "Pass" if float(score_val) >= 1.0 else "Fail"
            else:
                continue

            score_targets = []
            if is_latest:
                score_targets.append(conv_map[cid][latest_key])
            if is_first:
                score_targets.append(conv_map[cid][first_key])

            for target_scores in score_targets:
                already_has = any(target_scores.get(item) for item in cat_items)
                if already_has:
                    continue
                for item in cat_items:
                    target_scores[item] = pf

        # 3. Build task_details in the same shape as the sheet parser
        task_details: list[dict[str, Any]] = []
        for cid, info in conv_map.items():
            r_count = info["reviewer_review_count"]
            a_count = info["auditor_review_count"]

            # Symmetric fallback: if either view is empty, copy from the other
            latest_rev_scores = info["reviewer_scores"] or info["first_reviewer_scores"]
            latest_rev_reasons = info["reviewer_reasons"] or info["first_reviewer_reasons"]
            latest_aud_scores = info["auditor_scores"] or info["first_auditor_scores"]
            latest_aud_reasons = info["auditor_reasons"] or info["first_auditor_reasons"]
            first_rev_scores = info["first_reviewer_scores"] or info["reviewer_scores"]
            first_rev_reasons = info["first_reviewer_reasons"] or info["reviewer_reasons"]
            first_aud_scores = info["first_auditor_scores"] or info["auditor_scores"]
            first_aud_reasons = info["first_auditor_reasons"] or info["auditor_reasons"]

            has_data = bool(
                any(latest_rev_scores.values()) or any(latest_aud_scores.values())
            )

            task_details.append({
                "batch": info["batch_name"],
                "task": str(info["conversation_id"]),
                "task_link": info["colab_link"],
                "has_data": has_data,
                "reviewer_rework_count": max(r_count - 1, 0),
                "auditor_rework_count": max(a_count - 1, 0),
                "reviewer": {
                    "scores": latest_rev_scores,
                    "reasons": latest_rev_reasons,
                },
                "auditor": {
                    "scores": latest_aud_scores,
                    "reasons": latest_aud_reasons,
                },
                "first_reviewer": {
                    "scores": first_rev_scores,
                    "reasons": first_rev_reasons,
                },
                "first_auditor": {
                    "scores": first_aud_scores,
                    "reasons": first_aud_reasons,
                },
            })

        logger.info(
            f"Built {len(task_details)} task detail records from BigQuery "
            f"({sum(1 for t in task_details if t['has_data'])} with data)"
        )

        # 4. Compute aggregates
        empty_summary: dict[str, Any] = {
            "batch_list": [],
            "batch_fpy": {},
            "category_fpy": {},
            "rubric_item_fpy": {},
        }
        batch_quality = self._compute_batch_quality(task_details, empty_summary)
        rubric_fpy = self._compute_rubric_fpy_dynamic(task_details, rubric_categories)

        # 5. Compute daily rollup from BigQuery data
        daily_rollup = self._compute_daily_rollup_from_bq(
            client, project_id, task_details, team_roles,
            start_date=start_date, end_date=end_date,
        )

        return {
            "daily_rollup": daily_rollup,
            "batch_quality": batch_quality,
            "rubric_fpy": rubric_fpy,
            "task_details": task_details,
            "rubric_categories": rubric_categories,
            "summary": empty_summary,
        }

    # ------------------------------------------------------------------
    # Dynamic rubric FPY computation (for BigQuery data)
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_rubric_fpy_dynamic(
        task_details: list[dict],
        categories: list[dict],
    ) -> list[dict]:
        """Compute per-rubric-item FPY% using dynamic categories (no Summary tab)."""
        tasks_with_data = [t for t in task_details if t["has_data"]]
        results: list[dict] = []

        for cat in categories:
            cat_reviewer_total = 0
            cat_reviewer_pass = 0
            cat_auditor_total = 0
            cat_auditor_pass = 0

            item_results: list[dict] = []

            for item in cat["items"]:
                reviewer_total = 0
                reviewer_pass = 0
                auditor_total = 0
                auditor_pass = 0

                for t in tasks_with_data:
                    rv = t["reviewer"]["scores"].get(item, "").strip().upper()
                    if rv:
                        reviewer_total += 1
                        if rv == "PASS":
                            reviewer_pass += 1

                    av = t["auditor"]["scores"].get(item, "").strip().upper()
                    if av:
                        auditor_total += 1
                        if av == "PASS":
                            auditor_pass += 1

                cat_reviewer_total += reviewer_total
                cat_reviewer_pass += reviewer_pass
                cat_auditor_total += auditor_total
                cat_auditor_pass += auditor_pass

                r_fpy = round(reviewer_pass / reviewer_total * 100, 1) if reviewer_total else None
                r_rework = round(100 - r_fpy, 1) if r_fpy is not None else None
                a_fpy = round(auditor_pass / auditor_total * 100, 1) if auditor_total else None
                a_rework = round(100 - a_fpy, 1) if a_fpy is not None else None

                item_results.append({
                    "rubric_item": item,
                    "category": cat["name"],
                    "is_category_summary": False,
                    "reviewer_fpy": r_fpy,
                    "reviewer_rework": r_rework,
                    "auditor_fpy": a_fpy,
                    "auditor_rework": a_rework,
                    "source": "computed",
                })

            cat_r_fpy = round(cat_reviewer_pass / cat_reviewer_total * 100, 1) if cat_reviewer_total else None
            cat_r_rework = round(100 - cat_r_fpy, 1) if cat_r_fpy is not None else None
            cat_a_fpy = round(cat_auditor_pass / cat_auditor_total * 100, 1) if cat_auditor_total else None
            cat_a_rework = round(100 - cat_a_fpy, 1) if cat_a_fpy is not None else None

            results.append({
                "rubric_item": cat["name"],
                "category": cat["name"],
                "is_category_summary": True,
                "reviewer_fpy": cat_r_fpy,
                "reviewer_rework": cat_r_rework,
                "auditor_fpy": cat_a_fpy,
                "auditor_rework": cat_a_rework,
                "source": "computed",
            })
            results.extend(item_results)

        return results

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _empty_daily_rollup() -> dict[str, Any]:
        return {
            "total_annotations_l1": 0,
            "total_reviewed_l2": 0,
            "total_reviewed_l2_action": "",
            "total_passed_l2": 0,
            "total_flagged_rework": 0,
            "total_flagged_rework_action": "",
            "total_calibrated": 0,
            "passed_calibrator": 0,
            "failed_calibration": 0,
            "failed_calibration_action": "",
            "total_defects": 0,
            "high_severity": 0,
            "medium_severity": 0,
            "total_ready_to_ship": 0,
            "reviewer_fpy": 0,
            "reviewer_fpy_action": "",
            "auditor_fpy": 0,
            "auditor_fpy_action": "",
            "overall_status": "N/A",
            "updated_date": "",
        }

    def _compute_daily_rollup_from_bq(
        self,
        client,
        project_id: int,
        task_details: list[dict],
        team_roles: dict[str, str],
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        """Compute Daily Rollup metrics from BigQuery data.

        Uses conversation statuses + already-fetched task_details rubric scores.
        """
        from app.config import get_settings
        from datetime import datetime

        s = get_settings()
        p, d = s.gcp_project_id, s.bigquery_dataset

        date_filter = self._date_filter_sql("c", start_date, end_date)
        # --- Pipeline counts from conversation statuses ---
        status_query = f"""
        SELECT c.status, COUNT(*) AS cnt
        FROM `{p}.{d}.conversation` c
        WHERE c.project_id = {project_id}
          {date_filter}
        GROUP BY c.status
        """
        status_counts: dict[str, int] = {}
        for row in client.query(status_query).result():
            status_counts[row["status"]] = row["cnt"]

        # L1 Annotations = all tasks that were ever worked on (completed + validated + rework)
        total_annotations_l1 = (
            status_counts.get("completed", 0)
            + status_counts.get("validated", 0)
            + status_counts.get("rework", 0)
        )

        # Tasks with reviewer data
        tasks_with_reviewer = [
            t for t in task_details
            if t["has_data"] and any(v.strip() for v in t["reviewer"]["scores"].values())
        ]

        # Tasks with auditor data
        tasks_with_auditor = [
            t for t in task_details
            if t["has_data"] and any(v.strip() for v in t["auditor"]["scores"].values())
        ]

        total_reviewed_l2 = len(tasks_with_reviewer)

        # L2 Passed = reviewer reviewed and ALL rubrics passed
        reviewer_all_pass = [
            t for t in tasks_with_reviewer
            if all(v.upper() == "PASS" for v in t["reviewer"]["scores"].values() if v.strip())
        ]
        total_passed_l2 = len(reviewer_all_pass)

        # Flagged for Rework = conversations currently in rework status
        total_flagged_rework = status_counts.get("rework", 0)

        # --- Calibration metrics ---
        total_calibrated = len(tasks_with_auditor)

        auditor_all_pass = [
            t for t in tasks_with_auditor
            if all(v.upper() == "PASS" for v in t["auditor"]["scores"].values() if v.strip())
        ]
        passed_calibrator = len(auditor_all_pass)
        failed_calibration = total_calibrated - passed_calibrator

        # --- Defects: tasks where reviewer found at least one FAIL ---
        tasks_with_defects = [
            t for t in tasks_with_reviewer
            if any(v.upper() == "FAIL" for v in t["reviewer"]["scores"].values() if v.strip())
        ]
        total_defects = len(tasks_with_defects)

        # High severity = 3+ fails, Medium severity = 1-2 fails
        high_severity = 0
        medium_severity = 0
        for t in tasks_with_defects:
            fail_count = sum(1 for v in t["reviewer"]["scores"].values() if v.strip() and v.upper() == "FAIL")
            if fail_count >= 3:
                high_severity += 1
            else:
                medium_severity += 1

        total_ready_to_ship = total_passed_l2

        # --- FPY (based on first review action: approve vs rework) ---
        fpy_query = f"""
        SELECT
            r.conversation_id,
            cont.turing_email AS reviewer_email,
            JSON_EXTRACT_SCALAR(r.review_action, '$.type') AS action_type,
            r.submitted_at
        FROM `{p}.{d}.review` r
        JOIN `{p}.{d}.conversation` c ON c.id = r.conversation_id
        LEFT JOIN `{p}.{d}.contributor` cont ON cont.id = r.reviewer_id
        WHERE c.project_id = {project_id}
          AND r.review_type = 'manual'
          AND r.status = 'published'
          AND r.submitted_at IS NOT NULL
          {date_filter}
        ORDER BY r.conversation_id, r.submitted_at ASC
        """
        fpy_rows = list(client.query(fpy_query).result())

        r_total, r_pass, a_total, a_pass = 0, 0, 0, 0
        seen: dict[int, dict] = {}
        for row in fpy_rows:
            cid = row["conversation_id"]
            email = (row["reviewer_email"] or "").lower().strip()
            action = (row["action_type"] or "").lower()
            role = team_roles.get(email, "reviewer")

            if cid not in seen:
                seen[cid] = {}
            if role == "reviewer" and "reviewer" not in seen[cid]:
                seen[cid]["reviewer"] = True
                r_total += 1
                if action != "rework":
                    r_pass += 1
            elif role == "calibrator" and "calibrator" not in seen[cid]:
                seen[cid]["calibrator"] = True
                a_total += 1
                if action != "rework":
                    a_pass += 1

        reviewer_fpy = round(r_pass / r_total * 100, 1) if r_total > 0 else 0
        auditor_fpy = round(a_pass / a_total * 100, 1) if a_total > 0 else 0

        # --- Overall Status ---
        if r_total == 0:
            overall_status = "N/A"
        elif reviewer_fpy >= 95:
            overall_status = "Good"
        elif reviewer_fpy >= 80:
            overall_status = "OK"
        else:
            overall_status = "Risk"

        return {
            "total_annotations_l1": total_annotations_l1,
            "total_reviewed_l2": total_reviewed_l2,
            "total_reviewed_l2_action": "",
            "total_passed_l2": total_passed_l2,
            "total_flagged_rework": total_flagged_rework,
            "total_flagged_rework_action": f"{total_flagged_rework} tasks need rework" if total_flagged_rework > 0 else "",
            "total_calibrated": total_calibrated,
            "passed_calibrator": passed_calibrator,
            "failed_calibration": failed_calibration,
            "failed_calibration_action": f"{failed_calibration} tasks failed calibration" if failed_calibration > 0 else "",
            "total_defects": total_defects,
            "high_severity": high_severity,
            "medium_severity": medium_severity,
            "total_ready_to_ship": total_ready_to_ship,
            "reviewer_fpy": reviewer_fpy,
            "reviewer_fpy_action": "",
            "auditor_fpy": auditor_fpy,
            "auditor_fpy_action": "",
            "overall_status": overall_status,
            "updated_date": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }

    def _empty_response(self, project_id: int) -> dict[str, Any]:
        return {
            "daily_rollup": self._empty_daily_rollup(),
            "batch_quality": [],
            "rubric_fpy": [],
            "task_details": [],
            "rubric_categories": [],
            "summary": {
                "batch_list": [],
                "batch_fpy": {},
                "category_fpy": {},
                "rubric_item_fpy": {},
            },
        }


# Singleton instance
_service_instance: QualityRubricsService | None = None


def get_quality_rubrics_service() -> QualityRubricsService:
    global _service_instance
    if _service_instance is None:
        _service_instance = QualityRubricsService()
    return _service_instance
