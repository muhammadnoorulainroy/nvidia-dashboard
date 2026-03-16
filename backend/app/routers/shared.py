"""Router for secure share links — external read-only access to specific pages."""
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text

from app.auth import require_admin
from app.services.db_service import get_db_service
from app.services.quality_rubrics_service import get_quality_rubrics_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/shared", tags=["Share Links"])


# ── Schemas ──────────────────────────────────────────────────────────

class CreateShareLinkRequest(BaseModel):
    page: str = "quality-rubrics"
    project_id: Optional[int] = 60
    label: Optional[str] = None
    expires_in_days: Optional[int] = None


class ShareLinkResponse(BaseModel):
    id: int
    token: str
    page: str
    project_id: Optional[int]
    label: Optional[str]
    is_active: bool
    expires_at: Optional[str]
    created_by: str
    created_at: str


# ── Admin endpoints (JWT-protected) ─────────────────────────────────

@router.post("/links", response_model=ShareLinkResponse, summary="Create a share link")
async def create_share_link(
    body: CreateShareLinkRequest,
    user: dict = Depends(require_admin),
):
    token = secrets.token_urlsafe(48)
    expires_at = None
    if body.expires_in_days and body.expires_in_days > 0:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)

    db = get_db_service()
    with db.get_session() as session:
        session.execute(text(
            "INSERT INTO share_link (token, page, project_id, label, created_by, is_active, expires_at) "
            "VALUES (:token, :page, :project_id, :label, :created_by, true, :expires_at)"
        ), {
            "token": token,
            "page": body.page,
            "project_id": body.project_id,
            "label": body.label,
            "created_by": user["email"],
            "expires_at": expires_at,
        })
        row = session.execute(
            text("SELECT id, token, page, project_id, label, is_active, expires_at, created_by, created_at "
                 "FROM share_link WHERE token = :token"),
            {"token": token},
        ).fetchone()

    return _row_to_response(row)


@router.get("/links", response_model=list[ShareLinkResponse], summary="List share links")
async def list_share_links(user: dict = Depends(require_admin)):
    db = get_db_service()
    with db.get_session() as session:
        rows = session.execute(
            text("SELECT id, token, page, project_id, label, is_active, expires_at, created_by, created_at "
                 "FROM share_link ORDER BY created_at DESC")
        ).fetchall()
    return [_row_to_response(r) for r in rows]


@router.delete("/links/{link_id}", summary="Revoke a share link")
async def revoke_share_link(link_id: int, user: dict = Depends(require_admin)):
    db = get_db_service()
    with db.get_session() as session:
        result = session.execute(
            text("UPDATE share_link SET is_active = false WHERE id = :id"),
            {"id": link_id},
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Share link not found")
    return {"status": "revoked"}


# ── Public endpoint (token-validated, NO JWT) ────────────────────────

@router.get("/{token}/quality-rubrics/data", summary="Get quality rubrics via share link")
async def get_shared_quality_rubrics(
    token: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    link = _validate_token(token, expected_page="quality-rubrics")

    try:
        service = get_quality_rubrics_service()
        data = service.get_data(
            project_id=link["project_id"] or 60,
            force_refresh=False,
            start_date=start_date,
            end_date=end_date,
        )
        return data
    except Exception as e:
        logger.error(f"Error fetching shared quality rubrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch data")


# ── Helpers ──────────────────────────────────────────────────────────

def _validate_token(token: str, expected_page: str) -> dict:
    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text("SELECT id, page, project_id, is_active, expires_at "
                 "FROM share_link WHERE token = :token"),
            {"token": token},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid share link")

    if not row.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This share link has been revoked")

    if row.expires_at and row.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This share link has expired")

    if row.page != expected_page:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid share link")

    return {"id": row.id, "page": row.page, "project_id": row.project_id}


def _row_to_response(row) -> ShareLinkResponse:
    return ShareLinkResponse(
        id=row.id,
        token=row.token,
        page=row.page,
        project_id=row.project_id,
        label=row.label,
        is_active=row.is_active,
        expires_at=row.expires_at.isoformat() if row.expires_at else None,
        created_by=row.created_by,
        created_at=row.created_at.isoformat() if row.created_at else "",
    )
