"""
QRcode 登入模組路由 (QRCode Router) — 方案 A

登入 QRcode 直接編碼「登入頁固定 URL」（`{前端基礎URL}/login`，不含 token/UUID），
掃碼後進入一般登入頁（員工編號 + 圖形驗證碼）。不再產生或儲存一次性 token，
亦不顯示有效時間。
"""

from fastapi import APIRouter, Request
import qrcode
import base64
import os
from io import BytesIO
from urllib.parse import urlparse
from .. import schemas
from .auth import check_permission

router = APIRouter(prefix="/admin/qrcode", tags=["qrcode"])


def generate_qrcode_image(url: str) -> str:
    """生成 QRcode 圖片並返回 Base64 編碼的圖片 URL"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    # 將圖片轉換為 Base64
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return f"data:image/png;base64,{img_str}"


def resolve_frontend_base_url(request: Request) -> str:
    """解析前端對外基礎 URL（含部署子路徑，如 /training）。

    優先序：環境變數 FRONTEND_URL → X-Frontend-URL header → Referer/Origin → 推斷 Host。
    前端會以 `X-Frontend-URL` 明確傳遞含部署子路徑的基礎 URL，避免掃碼後 404。
    """
    # 優先使用環境變數 FRONTEND_URL（適合生產環境配置）
    frontend_url = os.getenv("FRONTEND_URL")
    if frontend_url:
        return frontend_url.rstrip("/")

    # 其次使用前端明確傳遞的 URL（含 /training 等部署子路徑）
    explicit_frontend_url = request.headers.get("x-frontend-url")
    if explicit_frontend_url:
        return explicit_frontend_url.rstrip("/")

    # 再者從 Referer 或 Origin header 提取
    referer = request.headers.get("referer") or request.headers.get("origin")
    if referer:
        parsed = urlparse(referer)
        return f"{parsed.scheme}://{parsed.netloc}"

    # 最後嘗試從請求 host 推斷
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    if ":8000" in host:
        # 後端端口，嘗試推斷前端開發端口
        host_without_port = host.split(":")[0]
        return f"{scheme}://{host_without_port}:5173"  # Vite 默認端口
    base_url = f"{scheme}://{host}"
    if "/api" in base_url:
        base_url = base_url.split("/api")[0]
    return base_url


@router.post("/login/generate", response_model=schemas.QRCodeGenerateResponse)
def generate_login_qrcode(
    request: Request,
    current_user=check_permission("menu:admin"),  # 僅 Admin
):
    """產生登入 QRcode（方案 A）。

    QRcode 內容為登入頁固定 URL（`{前端基礎URL}/login`），不含 token/UUID，
    亦不寫入 login_tokens；掃碼後進入一般登入流程（員工編號 + 圖形驗證碼）。
    """
    base_url = resolve_frontend_base_url(request)
    login_url = f"{base_url}/login"
    qrcode_image = generate_qrcode_image(login_url)

    return {
        "qrcode_url": qrcode_image,
        "login_url": login_url,
    }
