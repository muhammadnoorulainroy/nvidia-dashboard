"""Authentication endpoints: Google sign-in and token refresh."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text

from app.auth import verify_google_token, create_jwt, get_current_user
from app.services.db_service import get_db_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


class GoogleLoginRequest(BaseModel):
    token: str


class AuthResponse(BaseModel):
    access_token: str
    user: dict


@router.post("/google", response_model=AuthResponse)
async def google_login(body: GoogleLoginRequest):
    """Exchange a Google ID token for an application JWT."""
    google_user = verify_google_token(body.token)
    email = google_user["email"].lower().strip()

    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text("SELECT id, email, name, role, is_active FROM dashboard_user WHERE email = :email"),
            {"email": email},
        ).fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorised to access this dashboard. Contact an admin.",
            )

        if not row[4]:  # is_active
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been deactivated. Contact an admin.",
            )

        user_role = row[3]
        user_name = google_user.get("name") or row[2] or ""

        session.execute(
            text(
                "UPDATE dashboard_user SET last_login = :now, name = :name, picture = :pic WHERE id = :uid"
            ),
            {
                "now": datetime.now(timezone.utc),
                "name": user_name,
                "pic": google_user.get("picture", ""),
                "uid": row[0],
            },
        )
        session.commit()

    token = create_jwt(email=email, role=user_role, name=user_name)
    return AuthResponse(
        access_token=token,
        user={"email": email, "name": user_name, "role": user_role, "picture": google_user.get("picture", "")},
    )


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text("SELECT email, name, role, picture, is_active FROM dashboard_user WHERE email = :email"),
            {"email": user["email"]},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "email": row[0],
        "name": row[1],
        "role": row[2],
        "picture": row[3],
        "is_active": row[4],
    }
