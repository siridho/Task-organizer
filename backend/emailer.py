"""SendGrid emailer — no-ops silently when SENDGRID_API_KEY is not set."""
import os
import logging
from typing import Optional

log = logging.getLogger("nexus.mail")

def _client():
    key = os.environ.get("SENDGRID_API_KEY", "").strip()
    if not key:
        return None
    try:
        from sendgrid import SendGridAPIClient  # noqa: WPS433
        return SendGridAPIClient(key)
    except Exception as e:  # noqa: BLE001
        log.warning("SendGrid client unavailable: %s", e)
        return None


def send_email(to: str, subject: str, html: str, text: Optional[str] = None) -> bool:
    """Send a transactional email. Returns True on success, False otherwise.

    Silently no-ops (returns False, no exception) when the SendGrid key or
    sender email are not configured — useful for local/dev without email keys.
    """
    if not to:
        return False
    sender = os.environ.get("SENDGRID_SENDER", "").strip()
    client = _client()
    if not client or not sender:
        return False
    try:
        from sendgrid.helpers.mail import Mail  # noqa: WPS433

        msg = Mail(
            from_email=sender,
            to_emails=to,
            subject=subject,
            html_content=html,
            plain_text_content=text or "",
        )
        resp = client.send(msg)
        return 200 <= resp.status_code < 300
    except Exception as e:  # noqa: BLE001
        log.warning("SendGrid send failed to %s: %s", to, e)
        return False


def notify_email(user_email: str, actor_name: str, event_type: str, task_title: str,
                 task_id: Optional[str] = None) -> bool:
    """Format and send a notification email for a task event."""
    subject_map = {
        "assign": f"{actor_name} assigned you a task",
        "mention": f"{actor_name} mentioned you in a task",
        "comment": f"{actor_name} commented on your task",
        "edit": f"{actor_name} updated a task",
        "move": f"{actor_name} moved a task",
    }
    subject = subject_map.get(event_type, f"NexusTask update from {actor_name}")
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    link_line = ""
    if app_url and task_id:
        link_line = f'<p><a href="{app_url}" style="color:#3f6f5e">Open NexusTask →</a></p>'
    html = f"""
      <div style="font-family:sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#3f6f5e">{subject}</h2>
        <p style="font-size:14px;color:#26342d"><strong>Task:</strong> {task_title}</p>
        {link_line}
        <hr style="border:none;border-top:1px solid #dbe2d9"/>
        <p style="font-size:11px;color:#6d7a6f">
          You are receiving this because you are watching or assigned to this task in NexusTask.
        </p>
      </div>
    """
    text = f"{subject}\n\nTask: {task_title}\n\n{app_url}"
    return send_email(user_email, subject, html, text)
