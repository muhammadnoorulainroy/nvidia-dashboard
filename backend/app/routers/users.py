"""User management endpoints (admin only)."""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text

from app.auth import require_admin
from app.services.db_service import get_db_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["User Management"], dependencies=[Depends(require_admin)])


class UserOut(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    role: str
    is_active: bool
    created_at: Optional[str] = None
    last_login: Optional[str] = None


class UserCreate(BaseModel):
    email: str
    role: str = "user"
    name: Optional[str] = None


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    name: Optional[str] = None


def _row_to_user(row) -> dict:
    return {
        "id": row[0],
        "email": row[1],
        "name": row[2],
        "role": row[3],
        "is_active": row[4],
        "created_at": str(row[5]) if row[5] else None,
        "last_login": str(row[6]) if row[6] else None,
    }


@router.get("", response_model=list[UserOut])
async def list_users():
    db = get_db_service()
    with db.get_session() as session:
        rows = session.execute(
            text("SELECT id, email, name, role, is_active, created_at, last_login FROM dashboard_user ORDER BY id")
        ).fetchall()
    return [_row_to_user(r) for r in rows]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate):
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    email = body.email.lower().strip()
    db = get_db_service()
    with db.get_session() as session:
        exists = session.execute(
            text("SELECT 1 FROM dashboard_user WHERE email = :email"),
            {"email": email},
        ).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="User already exists")

        session.execute(
            text(
                "INSERT INTO dashboard_user (email, name, role, is_active) "
                "VALUES (:email, :name, :role, true)"
            ),
            {"email": email, "name": body.name or "", "role": body.role},
        )
        session.commit()

        row = session.execute(
            text(
                "SELECT id, email, name, role, is_active, created_at, last_login "
                "FROM dashboard_user WHERE email = :email"
            ),
            {"email": email},
        ).fetchone()

    logger.info(f"Created user {email} with role {body.role}")
    return _row_to_user(row)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, body: UserUpdate):
    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text("SELECT id FROM dashboard_user WHERE id = :uid"),
            {"uid": user_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        updates = []
        params: dict = {"uid": user_id}

        if body.role is not None:
            if body.role not in ("admin", "user"):
                raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
            updates.append("role = :role")
            params["role"] = body.role

        if body.is_active is not None:
            updates.append("is_active = :active")
            params["active"] = body.is_active

        if body.name is not None:
            updates.append("name = :name")
            params["name"] = body.name

        if updates:
            session.execute(
                text(f"UPDATE dashboard_user SET {', '.join(updates)} WHERE id = :uid"),
                params,
            )
            session.commit()

        row = session.execute(
            text(
                "SELECT id, email, name, role, is_active, created_at, last_login "
                "FROM dashboard_user WHERE id = :uid"
            ),
            {"uid": user_id},
        ).fetchone()

    return _row_to_user(row)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text("SELECT email FROM dashboard_user WHERE id = :uid"),
            {"uid": user_id},
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if row[0] == admin["email"]:
            raise HTTPException(status_code=400, detail="Cannot delete yourself")

        session.execute(text("DELETE FROM dashboard_user WHERE id = :uid"), {"uid": user_id})
        session.commit()
    logger.info(f"Deleted user id={user_id}")
