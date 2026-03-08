"""
Service for reading and serving quality rubrics data from a Google Sheet.

Reads directly from the sheet (no PostgreSQL storage) with in-memory caching.
"""
import os
import time
import logging
from typing import Any
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 300  # 5 minutes

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
    """Reads quality rubrics data from Google Sheets with caching."""

    def __init__(self):
        self._cache: dict[str, Any] | None = None
        self._cache_time: float = 0

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

    def get_data(self, force_refresh: bool = False) -> dict[str, Any]:
        """Return all quality rubrics data, from cache if still fresh."""
        now = time.time()
        if not force_refresh and self._cache and (now - self._cache_time) < CACHE_TTL_SECONDS:
            return self._cache

        logger.info("Fetching quality rubrics data from Google Sheet...")
        try:
            data = self._fetch_and_parse()
            self._cache = data
            self._cache_time = time.time()
            logger.info("Quality rubrics data fetched and cached successfully")
            return data
        except Exception as e:
            logger.error(f"Error fetching quality rubrics data: {e}")
            if self._cache:
                logger.warning("Returning stale cache due to fetch error")
                return self._cache
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
        from collections import defaultdict

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
                total = len(tasks)
                reviewer_passed = sum(
                    1 for t in tasks
                    if all(v.upper() == "PASS" for v in t["reviewer"]["scores"].values() if v)
                )
                auditor_passed = sum(
                    1 for t in tasks
                    if all(v.upper() == "PASS" for v in t["auditor"]["scores"].values() if v)
                )
                results.append({
                    "batch": batch_name,
                    "reviewer_to_trainer_fpy": round(reviewer_passed / total * 100, 1),
                    "reviewer_to_trainer_rework": round((total - reviewer_passed) / total * 100, 1),
                    "auditor_to_reviewer_fpy": round(auditor_passed / total * 100, 1),
                    "auditor_to_trainer_rework": round((total - auditor_passed) / total * 100, 1),
                    "source": "computed",
                    "task_count": total,
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


# Singleton instance
_service_instance: QualityRubricsService | None = None


def get_quality_rubrics_service() -> QualityRubricsService:
    global _service_instance
    if _service_instance is None:
        _service_instance = QualityRubricsService()
    return _service_instance
