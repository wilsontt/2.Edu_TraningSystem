"""
SMTP 郵件發送服務（用於 Email OTP 備援登入）。

SMTP 帳密由 Settings（環境變數）注入，嚴禁 hardcode。
SMTP_PASSWORD 建議以 `enc:<Fernet密文>` 儲存（見 crypto.resolve_env_secret）。
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import Settings, get_settings
from .crypto import CredentialEncryptionError

logger = logging.getLogger(__name__)


class SmtpDeliveryError(Exception):
    """SMTP 寄信失敗（503）。"""


def send_otp_email(
    to: str,
    otp: str,
    username: str,
    settings: Settings | None = None,
) -> None:
    """
    寄送 Email OTP 驗證碼。

    Args:
        to: 收件 Email
        otp: 6 位數字驗證碼（明文，僅於此處出現一次後即雜湊入 DB）
        username: AD 使用者名稱（用於信件內容）
        settings: 注入測試用；預設用 get_settings()

    Raises:
        SmtpDeliveryError: 連線或寄信失敗
    """
    if settings is None:
        settings = get_settings()

    if not settings.smtp_configured:
        raise SmtpDeliveryError("SMTP 未設定，無法寄送驗證碼")

    try:
        smtp_password = settings.resolve_smtp_password()
    except CredentialEncryptionError as exc:
        raise SmtpDeliveryError(str(exc)) from exc

    if not smtp_password:
        raise SmtpDeliveryError("SMTP 密碼為空，無法寄送驗證碼")

    subject = "【系統管理登入】Email 驗證碼"
    ttl_min = settings.ad_email_otp_ttl_minutes

    body_html = f"""\
<html><body>
<p>您好 <strong>{username}</strong>，</p>
<p>您的系統管理登入驗證碼為：</p>
<h2 style="letter-spacing:4px;">{otp}</h2>
<p>此驗證碼有效期限為 <strong>{ttl_min} 分鐘</strong>，請勿外洩。</p>
<p>若非您本人操作，請忽略此郵件，並聯絡 IT 部門。</p>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10)

        server.login(settings.smtp_user, smtp_password)
        server.sendmail(msg["From"], [to], msg.as_string())
        server.quit()
        logger.info("OTP 驗證碼已寄至 %s（username=%s）", _mask_email(to), username)
    except smtplib.SMTPException as exc:
        logger.error("SMTP 寄信失敗: %s", exc)
        raise SmtpDeliveryError(f"寄信失敗：{exc}") from exc
    except OSError as exc:
        logger.error("SMTP 連線失敗: %s", exc)
        raise SmtpDeliveryError(f"無法連線至 SMTP 伺服器：{exc}") from exc


def _mask_email(email: str) -> str:
    """將 Email 遮罩（用於 log），例：w***@yourco.com。"""
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"
