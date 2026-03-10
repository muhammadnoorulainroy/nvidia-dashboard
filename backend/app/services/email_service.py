"""SMTP email service for invite and password-reset emails."""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import get_settings

logger = logging.getLogger(__name__)


def _send(to_email: str, subject: str, html_body: str) -> bool:
    settings = get_settings()
    if not settings.mailer_username or not settings.mailer_password:
        logger.warning("Mailer credentials not configured — skipping email")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.mailer_username
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.mailer_host, settings.mailer_port) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.mailer_username, settings.mailer_password)
            server.sendmail(settings.mailer_username, to_email, msg.as_string())
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
    except Exception as exc:
        logger.error(f"Failed to send email to {to_email}: {exc}")
        return False


def send_invite_email(to_email: str, invite_token: str, name: str | None = None) -> bool:
    settings = get_settings()
    signup_url = f"{settings.frontend_url}/signup?token={invite_token}"
    greeting = f"Hi {name}," if name else "Hi,"

    html = f"""\
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:32px">
      <div style="background:linear-gradient(135deg,#76B900,#5A8F00);color:#fff;padding:16px 24px;
                  border-radius:8px 8px 0 0;text-align:center;font-weight:700;font-size:18px">
        NVIDIA Dashboard
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px">
        <p>{greeting}</p>
        <p>You have been invited to the <strong>NVIDIA Dashboard</strong>.
           Click the button below to create your password and activate your account.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="{signup_url}"
             style="background:#76B900;color:#fff;padding:12px 32px;border-radius:6px;
                    text-decoration:none;font-weight:600;display:inline-block">
            Set Up Your Account
          </a>
        </p>
        <p style="color:#64748B;font-size:13px">
          This link expires in 48 hours. If you didn't expect this email, you can safely ignore it.
        </p>
        <p style="color:#94A3B8;font-size:12px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px">
          Or copy and paste this URL into your browser:<br>
          <a href="{signup_url}" style="color:#76B900;word-break:break-all">{signup_url}</a>
        </p>
      </div>
    </div>"""

    return _send(to_email, "You're invited to NVIDIA Dashboard", html)


def send_reset_email(to_email: str, reset_token: str) -> bool:
    settings = get_settings()
    reset_url = f"{settings.frontend_url}/reset-password?token={reset_token}"

    html = f"""\
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:32px">
      <div style="background:linear-gradient(135deg,#76B900,#5A8F00);color:#fff;padding:16px 24px;
                  border-radius:8px 8px 0 0;text-align:center;font-weight:700;font-size:18px">
        NVIDIA Dashboard
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:24px">
        <p>Hi,</p>
        <p>We received a request to reset your password for the <strong>NVIDIA Dashboard</strong>.
           Click the button below to choose a new password.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="{reset_url}"
             style="background:#76B900;color:#fff;padding:12px 32px;border-radius:6px;
                    text-decoration:none;font-weight:600;display:inline-block">
            Reset Password
          </a>
        </p>
        <p style="color:#64748B;font-size:13px">
          This link expires in 1 hour. If you didn't request this, you can safely ignore it.
        </p>
        <p style="color:#94A3B8;font-size:12px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px">
          Or copy and paste this URL into your browser:<br>
          <a href="{reset_url}" style="color:#76B900;word-break:break-all">{reset_url}</a>
        </p>
      </div>
    </div>"""

    return _send(to_email, "Reset your NVIDIA Dashboard password", html)
