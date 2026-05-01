"""
認證工具函式 (Authentication Utilities)
負責處理 JWT Token 的簽發、驗證以及過期時間管理。
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext

# ----------------------------------------------------------------
# 安全與演算法配置 (Security & Algorithm Configuration)
# ----------------------------------------------------------------

# JWT 簽章金鑰 (Secret Key) - 生產環境務必更換並使用環境變數
SECRET_KEY = "crown-secret-key-for-internal-education-system"
# 指定簽名演算法
ALGORITHM = "HS256"
# Token 有效期限 (480 分鐘 = 8 小時)
ACCESS_TOKEN_EXPIRE_MINUTES = 480

# 密碼雜湊處理器 (目前系統採用免密登入，此為擴充預留)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ----------------------------------------------------------------
# 核心功能函式 (Core Utility Functions)
# ----------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    生成 JWT 存取權杖 (Access Token)
    :param data: 欲封裝進 Token 的 Payload (如 emp_id, role)
    :param expires_delta: 自定義過期時長，若無則使用預設值
    :return: 編碼後的 JWT 字串
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # 加入過期時間欄位 (exp)
    to_encode.update({"exp": expire})
    # 使用 SECRET_KEY 進行對稱式加密簽名
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    """
    驗證並解析 JWT 權杖
    :param token: 前端傳來的 Bearer Token
    :return: 解析後的 Payload (dict) 或於驗證失敗時回傳 None
    """
    try:
        # 解碼 Token，若過期或金鑰不符會拋出 JWTError
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        # 驗證失敗 (Token 無效、過期或經篡改)
        return None
