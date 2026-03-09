"""
Authentication helpers: Google ID-token verification, JWT creation/validation,
and FastAPI dependencies for protecting routes.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from sqlalchemy import text

from app.config import get_settings
from app.services.db_service import get_db_service

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"


def verify_google_token(token: str) -> dict:
    """Validate a Google OAuth2 ID token and return the payload (email, name, picture)."""
    settings = get_settings()
    try:
        payload = google_id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.oauth_client_id,
        )
        if payload.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
            raise ValueError("Invalid issuer")
        return {
            "email": payload["email"],
            "name": payload.get("name", ""),
            "picture": payload.get("picture", ""),
        }
    except Exception as exc:
        logger.warning(f"Google token verification failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        ) from exc


def create_jwt(email: str, role: str, name: str = "") -> str:
    """Create a signed JWT containing user identity and role."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "role": role,
        "name": name,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_ALGORITHM)


def decode_jwt(token: str) -> dict:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def _extract_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return auth_header[7:]


async def get_current_user(request: Request) -> dict:
    """FastAPI dependency – extracts JWT, verifies it, returns user dict."""
    token = _extract_token(request)
    payload = decode_jwt(token)
    return {
        "email": payload["sub"],
        "role": payload.get("role", "user"),
        "name": payload.get("name", ""),
    }


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency – ensures the current user has admin role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def seed_initial_admin() -> None:
    """Create initial admin users from INITIAL_ADMIN_EMAILS (comma-separated)."""
    settings = get_settings()
    raw = settings.initial_admin_emails
    if not raw:
        return

    emails = [e.strip().lower() for e in raw.split(",") if e.strip()]
    if not emails:
        return

    db = get_db_service()
    try:
        with db.get_session() as session:
            for email in emails:
                exists = session.execute(
                    text("SELECT 1 FROM dashboard_user WHERE email = :email"),
                    {"email": email},
                ).fetchone()
                if not exists:
                    session.execute(
                        text(
                            "INSERT INTO dashboard_user (email, name, role, is_active) "
                            "VALUES (:email, :name, 'admin', true)"
                        ),
                        {"email": email, "name": "Admin"},
                    )
                    logger.info(f"Seeded initial admin user: {email}")
                else:
                    logger.debug(f"Admin user already exists: {email}")
            session.commit()
    except Exception as exc:
        logger.error(f"Failed to seed admin users: {exc}")
