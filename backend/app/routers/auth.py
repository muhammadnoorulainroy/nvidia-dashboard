"""Authentication endpoints: email/password sign-in, signup, password reset."""
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text

from app.auth import (
    create_jwt,
    decode_jwt,
    get_current_user,
    hash_password,
    verify_password,
)
from app.services.db_service import get_db_service
from app.services.email_service import send_invite_email, send_reset_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


# --------------- request/response schemas ---------------

class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    token: str
    name: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AuthResponse(BaseModel):
    access_token: str
    user: dict


# --------------- endpoints ---------------

@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest):
    email = body.email.lower().strip()
    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text(
                "SELECT id, email, name, role, is_active, password_hash, must_change_password "
                "FROM dashboard_user WHERE email = :email"
            ),
            {"email": email},
        ).fetchone()

        if not row or not row[5]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        if not row[4]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account has been deactivated. Contact an admin.")

        if not verify_password(body.password, row[5]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        must_change = bool(row[6])
        session.execute(
            text("UPDATE dashboard_user SET last_login = :now WHERE id = :uid"),
            {"now": datetime.now(timezone.utc), "uid": row[0]},
        )
        session.commit()

    user_name = row[2] or ""
    token = create_jwt(email=email, role=row[3], name=user_name, must_change_password=must_change)
    return AuthResponse(
        access_token=token,
        user={"email": email, "name": user_name, "role": row[3], "must_change_password": must_change},
    )


@router.post("/signup")
async def signup(body: SignupRequest):
    """Accept an invite token, set name + password."""
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text(
                "SELECT id, email, invite_token_expires, password_hash "
                "FROM dashboard_user WHERE invite_token = :token"
            ),
            {"token": body.token},
        ).fetchone()

        if not row:
            raise HTTPException(status_code=400, detail="Invalid or expired invite link")

        if row[3]:
            raise HTTPException(status_code=400, detail="Account already activated. Please log in.")

        if row[2] and row[2] < datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(status_code=400, detail="Invite link has expired. Ask an admin to resend.")

        pw_hash = hash_password(body.password)
        session.execute(
            text(
                "UPDATE dashboard_user SET password_hash = :pw, name = :name, "
                "invite_token = NULL, invite_token_expires = NULL, must_change_password = false "
                "WHERE id = :uid"
            ),
            {"pw": pw_hash, "name": body.name.strip(), "uid": row[0]},
        )
        session.commit()

    return {"detail": "Account created successfully. You can now sign in."}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    """Send a password-reset email. Always returns 200 to prevent user enumeration."""
    email = body.email.lower().strip()
    db = get_db_service()

    with db.get_session() as session:
        row = session.execute(
            text("SELECT id, email, is_active, name FROM dashboard_user WHERE email = :email"),
            {"email": email},
        ).fetchone()

        if row and row[2]:
            token = secrets.token_urlsafe(48)
            expires = datetime.now(timezone.utc) + timedelta(hours=1)
            session.execute(
                text(
                    "UPDATE dashboard_user SET reset_token = :token, reset_token_expires = :exp WHERE id = :uid"
                ),
                {"token": token, "exp": expires, "uid": row[0]},
            )
            session.commit()
            send_reset_email(email, token)

    return {"detail": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text(
                "SELECT id, reset_token_expires FROM dashboard_user WHERE reset_token = :token"
            ),
            {"token": body.token},
        ).fetchone()

        if not row:
            raise HTTPException(status_code=400, detail="Invalid or expired reset link")

        if row[1] and row[1] < datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(status_code=400, detail="Reset link has expired. Request a new one.")

        pw_hash = hash_password(body.password)
        session.execute(
            text(
                "UPDATE dashboard_user SET password_hash = :pw, "
                "reset_token = NULL, reset_token_expires = NULL, must_change_password = false "
                "WHERE id = :uid"
            ),
            {"pw": pw_hash, "uid": row[0]},
        )
        session.commit()

    return {"detail": "Password reset successfully. You can now sign in."}


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text("SELECT id, password_hash FROM dashboard_user WHERE email = :email"),
            {"email": user["email"]},
        ).fetchone()

        if not row or not verify_password(body.current_password, row[1]):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

        pw_hash = hash_password(body.new_password)
        session.execute(
            text(
                "UPDATE dashboard_user SET password_hash = :pw, must_change_password = false WHERE id = :uid"
            ),
            {"pw": pw_hash, "uid": row[0]},
        )
        session.commit()

    new_token = create_jwt(email=user["email"], role=user["role"], name=user["name"], must_change_password=False)
    return {"detail": "Password changed successfully", "access_token": new_token}


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    db = get_db_service()
    with db.get_session() as session:
        row = session.execute(
            text(
                "SELECT email, name, role, is_active, must_change_password "
                "FROM dashboard_user WHERE email = :email"
            ),
            {"email": user["email"]},
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "email": row[0],
        "name": row[1],
        "role": row[2],
        "is_active": row[3],
        "must_change_password": row[4],
    }
