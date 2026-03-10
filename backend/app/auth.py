"""
Authentication helpers: password hashing, JWT creation/validation,
and FastAPI dependencies for protecting routes.
"""
import logging
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import text

from app.config import get_settings
from app.services.db_service import get_db_service

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_jwt(email: str, role: str, name: str = "", must_change_password: bool = False) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "role": role,
        "name": name,
        "must_change_password": must_change_password,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_ALGORITHM)


def decode_jwt(token: str) -> dict:
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
        "must_change_password": payload.get("must_change_password", False),
    }


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency – ensures the current user has admin role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def seed_initial_admin() -> None:
    """Create initial admin users with a default password (must_change_password=True)."""
    settings = get_settings()
    raw = settings.initial_admin_emails
    if not raw:
        return

    emails = [e.strip().lower() for e in raw.split(",") if e.strip()]
    if not emails:
        return

    pw_hash = hash_password(settings.default_admin_password)

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
                            "INSERT INTO dashboard_user "
                            "(email, name, role, is_active, password_hash, must_change_password) "
                            "VALUES (:email, :name, 'admin', true, :pw_hash, true)"
                        ),
                        {"email": email, "name": "Admin", "pw_hash": pw_hash},
                    )
                    logger.info(f"Seeded initial admin user: {email}")
                else:
                    has_pw = session.execute(
                        text("SELECT password_hash FROM dashboard_user WHERE email = :email"),
                        {"email": email},
                    ).fetchone()
                    if not has_pw[0]:
                        session.execute(
                            text(
                                "UPDATE dashboard_user SET password_hash = :pw_hash, "
                                "must_change_password = true WHERE email = :email"
                            ),
                            {"pw_hash": pw_hash, "email": email},
                        )
                        logger.info(f"Set default password for existing admin: {email}")
                    else:
                        logger.debug(f"Admin user already has password: {email}")
            session.commit()
    except Exception as exc:
        logger.error(f"Failed to seed admin users: {exc}")
