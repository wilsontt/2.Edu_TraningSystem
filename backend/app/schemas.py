"""
Pydantic 資料模型定義 (Pydantic Schemas)
負責定義所有 API 請求 (Request) 與回應 (Response) 的資料結構、類型校驗及序列化規則。
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Optional
from datetime import date, datetime
import re

# ----------------------------------------------------------------
# 部門與職務相關模型 (Department & JobTitle Schemas)
# ----------------------------------------------------------------

# --- 部門資料結構 ---
class DepartmentBase(BaseModel):
    name: str

class DepartmentCreate(DepartmentBase):
    pass

class Department(DepartmentBase):
    id: int
    user_count: int = 0
    active_user_count: int = 0
    inactive_user_count: int = 0

    class Config:
        from_attributes = True


# --- 職務資料結構 ---
class JobTitleBase(BaseModel):
    name: str


class JobTitleCreate(JobTitleBase):
    pass


class JobTitleUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class JobTitle(JobTitleBase):
    id: int
    sort_order: int = 0

    class Config:
        from_attributes = True


# ----------------------------------------------------------------
# 訓練分類與計畫模型 (Category & TrainingPlan Schemas)
# ----------------------------------------------------------------

# --- 分類資料結構 ---
class SubCategoryBase(BaseModel):
    name: str
    main_id: int

class SubCategoryCreate(SubCategoryBase):
    pass

class SubCategory(SubCategoryBase):
    id: int
    class Config:
        from_attributes = True

class MainCategoryBase(BaseModel):
    name: str

class MainCategoryCreate(MainCategoryBase):
    pass

class MainCategory(MainCategoryBase):
    id: int
    sub_categories: List[SubCategory] = []
    class Config:
        from_attributes = True

# --- 訓練計畫資料結構 ---
class TrainingPlanBase(BaseModel):
    title: str
    sub_category_id: Optional[int] = None # 改為可選，避免資料庫舊資料造成 500 錯誤
    dept_id: int
    training_date: date
    end_date: Optional[date] = None
    timer_enabled: bool = False
    time_limit: int = 0
    passing_score: int = 60

class TrainingPlanCreate(TrainingPlanBase):
    target_dept_ids: List[int] = [] # 新增受課單位 IDs
    target_user_ids: List[str] = [] # 新增個人受課對象 IDs
    expected_attendance: Optional[int] = None  # 應到人數（可選）

class TrainingPlan(TrainingPlanBase):
    id: int
    year: Optional[str] = None # 改為可選
    sub_category: Optional['SubCategory'] = None  # 子分類詳情
    target_departments: List['Department'] = [] # 回傳受課單位詳情
    target_users: List['User'] = [] # 回傳個人受課對象詳情
    expected_attendance: Optional[int] = None  # 應到人數
    is_archived: bool = False  # 是否已封存
    
    class Config:
        from_attributes = True

class TrainingFormUserOption(BaseModel):
    """訓練計畫表單：個人授課對象選項（僅在職人員）"""
    emp_id: str
    name: str
    dept_id: Optional[int] = None
    dept_name: str = "未知"

# ----------------------------------------------------------------
# 用戶、角色與權限模型 (User, Role & Permission Schemas)
# ----------------------------------------------------------------

# --- 用戶與認證擴充 ---
class UserBase(BaseModel):
    """用戶基礎模型（用於輸出，不包含驗證規則）"""
    emp_id: str
    name: str

class UserCreate(BaseModel):
    """創建用戶請求（包含驗證規則）"""
    emp_id: str = Field(..., min_length=1, max_length=10, description="員工編號，必須是1-10碼的數字")
    name: str = Field(..., min_length=1, max_length=20, description="姓名，最長20個字符")
    dept_id: int
    password: Optional[str] = None # 註冊時使用（如有需要）
    
    @field_validator('emp_id')
    @classmethod
    def validate_emp_id(cls, v: str) -> str:
        """驗證員工編號必須是1-10碼的數字，或特殊帳號 admin（僅登入時）"""
        v_lower = v.lower()
        if v_lower != 'admin' and not re.match(r'^[0-9]{1,10}$', v):
            raise ValueError('員工編號必須是1-10碼的數字')
        return v_lower if v_lower == 'admin' else v
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """驗證姓名長度"""
        v = v.strip()
        if len(v) == 0:
            raise ValueError('姓名不能為空')
        if len(v) > 20:
            raise ValueError('姓名最長20個字符')
        return v

class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=20, description="姓名，最長20個字符")
    dept_id: Optional[int] = None
    role_id: Optional[int] = None
    job_title_id: Optional[int] = None
    status: Optional[str] = None
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """驗證姓名長度"""
        if v is None:
            return v
        v = v.strip()
        if len(v) == 0:
            raise ValueError('姓名不能為空')
        if len(v) > 20:
            raise ValueError('姓名最長20個字符')
        return v

class User(UserBase):
    dept_id: Optional[int] = None
    role_id: Optional[int] = None
    status: str

    class Config:
        from_attributes = True

# UserDetail 移動到 Role 定義之後

# --- 角色與權限資料結構 ---
class RoleBase(BaseModel):
    name: str

class RoleCreate(RoleBase):
    pass

class Role(RoleBase):
    id: int
    user_count: int = 0
    function_count: int = 0

    class Config:
        from_attributes = True

class UserDetail(User):
    department: Optional[Department] = None
    role: Optional[Role] = None
    job_title: Optional[JobTitle] = None

class SystemFunctionBase(BaseModel):
    name: str
    code: str
    parent_id: Optional[int] = None
    path: Optional[str] = None

class SystemFunctionCreate(SystemFunctionBase):
    pass

class SystemFunction(SystemFunctionBase):
    id: int
    children: List['SystemFunction'] = []
    class Config:
        from_attributes = True

class RolePermissionUpdate(BaseModel):
    function_ids: List[int]

class RoleDepartmentScopeUpdate(BaseModel):
    scope_type: str = Field(..., description="all | department | self")
    dept_ids: List[int] = []


class RoleDepartmentScopeResponse(BaseModel):
    role_id: int
    scope_type: str
    dept_ids: List[int] = []

# ----------------------------------------------------------------
# 考題、題庫與報到模型 (Question, Bank & Attendance Schemas)
# ----------------------------------------------------------------

# 更新遞迴模型的向前參照
# --- 考題資料結構 ---
class QuestionBase(BaseModel):
    content: str
    question_type: str
    options: Optional[str] = None
    answer: str
    points: int = 10
    hint: Optional[str] = None
    level: Optional[str] = None  # 題目難易度 E/M/H

class QuestionCreate(QuestionBase):
    plan_id: int

class QuestionUpdate(BaseModel):
    content: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[str] = None
    answer: Optional[str] = None
    points: Optional[int] = None
    hint: Optional[str] = None
    level: Optional[str] = None

class Question(QuestionBase):
    id: int
    plan_id: int
    
    class Config:
        from_attributes = True


class BulkDeleteQuestionsRequest(BaseModel):
    """批次刪除題目請求"""
    question_ids: List[int]

# 更新遞迴模型的向前參照
class QuestionBankBase(BaseModel):
    content: str
    question_type: str
    options: Optional[str] = None
    answer: str
    tags: Optional[str] = None
    hint: Optional[str] = None
    level: Optional[str] = None  # 題目難易度 E/M/H

class QuestionBankCreate(QuestionBankBase):
    pass

class QuestionBankUpdate(BaseModel):
    content: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[str] = None
    answer: Optional[str] = None
    tags: Optional[str] = None
    hint: Optional[str] = None
    level: Optional[str] = None

class QuestionBank(QuestionBankBase):
    id: int
    created_by: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class QuestionBankList(BaseModel):
    items: List[QuestionBank]
    total: int
    page: int
    size: int
    total_pages: int

# --- 報到記錄資料結構 ---
class AttendanceRecordBase(BaseModel):
    plan_id: int

class AttendanceRecordCreate(AttendanceRecordBase):
    ip_address: Optional[str] = None

class AttendanceRecord(AttendanceRecordBase):
    id: int
    emp_id: str
    checkin_time: datetime
    ip_address: Optional[str] = None
    
    class Config:
        from_attributes = True

class AttendanceStatus(BaseModel):
    is_checked_in: bool
    checkin_time: Optional[datetime] = None

class CheckInResponse(BaseModel):
    success: bool
    checkin_time: datetime

# --- 報到統計資料結構 ---
class AttendanceStats(BaseModel):
    plan_id: int
    expected_count: int  # 應到人數
    actual_count: int    # 實到人數
    attendance_rate: float  # 出席率
    leave_count: int = 0  # 請假人數
    absent_without_reason_count: int = 0  # 未到（未填原因）
    checked_in_users: List[dict] = []  # 已報到用戶列表
    not_checked_in_users: List[dict] = []  # 未報到用戶列表

class ExpectedAttendanceUpdate(BaseModel):
    expected_attendance: int

class CalculatedAttendance(BaseModel):
    calculated_count: int


class AbsenceReasonUpdate(BaseModel):
    """未報到原因：填寫/更新"""
    emp_id: str
    reason_code: str  # sick_leave, business_trip, official_leave, other
    reason_text: Optional[str] = None  # 選 other 時必填


class AbsenceReasonBulkUpdate(BaseModel):
    """未報到原因：批次填寫/更新"""
    emp_ids: List[str]
    reason_code: str  # sick_leave, business_trip, official_leave, other
    reason_text: Optional[str] = None  # 選 other 時必填


# ----------------------------------------------------------------
# QRcode 登入與 Token 相關模型 (QRCode & Token Schemas)
# ----------------------------------------------------------------

# --- 登入 Token 資料結構 ---
class LoginTokenBase(BaseModel):
    expires_at: datetime

class LoginTokenCreate(LoginTokenBase):
    pass

class LoginToken(LoginTokenBase):
    id: int
    token: str
    created_by: str
    created_at: datetime
    is_used: bool
    
    class Config:
        from_attributes = True

class QRCodeGenerateResponse(BaseModel):
    """方案 A：登入 QRcode 僅含登入頁固定 URL，不再回傳一次性 token 或過期時間。"""
    qrcode_url: str  # Base64 編碼的圖片
    login_url: str   # 登入頁完整 URL（供複製/檢視）

class QRCodeTokenValidate(BaseModel):
    valid: bool
    expires_at: Optional[datetime] = None
    reason: Optional[str] = None

class QRCodeLoginRequest(BaseModel):
    emp_id: str = Field(..., min_length=1, max_length=10, description="員工編號，必須是1-10碼的數字")
    captcha_id: str
    answer: str
    
    @field_validator('emp_id')
    @classmethod
    def validate_emp_id(cls, v: str) -> str:
        """驗證員工編號必須是1-10碼的數字，或特殊帳號 admin（僅登入時）"""
        v_lower = v.lower()
        if v_lower != 'admin' and not re.match(r'^[0-9]{1,10}$', v):
            raise ValueError('員工編號必須是1-10碼的數字')
        return v_lower if v_lower == 'admin' else v

class CheckInQRCodeResponse(BaseModel):
    plan_id: int
    plan_title: str
    qrcode_url: str  # Base64 編碼的圖片
    checkin_url: str  # 報到 URL（供複製使用）

SystemFunction.update_forward_refs()


# ----------------------------------------------------------------
# 教材庫相關模型 (Teaching Material Schemas) — Wave 3
# ----------------------------------------------------------------

class MaterialTypeBase(BaseModel):
    name: str
    slug: str
    sort_order: int = 0
    max_file_bytes: Optional[int] = None
    is_active: bool = True


class MaterialTypeCreate(MaterialTypeBase):
    pass


class MaterialTypeUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    sort_order: Optional[int] = None
    max_file_bytes: Optional[int] = None
    is_active: Optional[bool] = None


class MaterialType(MaterialTypeBase):
    id: int

    class Config:
        from_attributes = True


class TeachingMaterial(BaseModel):
    id: int
    plan_id: Optional[int] = None
    title: str
    material_type_id: int
    description: Optional[str] = None
    tags: Optional[str] = None
    original_filename: str
    stored_filename: str
    storage_path: str
    file_format: str
    file_size_bytes: int
    year: str
    sub_category_id: Optional[int] = None
    uploaded_by: str
    uploaded_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


class TeachingMaterialList(BaseModel):
    items: List[TeachingMaterial]
    total: int
    page: int
    size: int
    total_pages: int


class TeachingMaterialUpdate(BaseModel):
    title: Optional[str] = None
    material_type_id: Optional[int] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class ConflictCheckResponse(BaseModel):
    has_conflict: bool
    existing: Optional[dict] = None  # { id, title, original_filename, uploaded_at }


class UploadResult(BaseModel):
    succeeded: List[dict]  # { id, original_filename }
    failed: List[dict]     # { original_filename, reason }


class NasSessionVerifyRequest(BaseModel):
    nas_username: str
    nas_password: str


class NasSessionVerifyResponse(BaseModel):
    nas_session_token: str
    expires_in: int


class BatchDownloadRequest(BaseModel):
    ids: List[int]
    nas_username: Optional[str] = None
    nas_password: Optional[str] = None
    nas_session_token: Optional[str] = None


# ----------------------------------------------------------------
# 排程備份相關模型 (Backup Schedule Schemas) — Wave 4
# ----------------------------------------------------------------

class BackupScheduleConfigOut(BaseModel):
    """排程設定回應；密碼欄位永不回傳明文，僅回傳是否已設定。"""
    enabled: bool
    frequency: str
    time_of_day: str
    weekday: Optional[int] = None
    retention_count: int
    destination: Optional[str] = None
    backup_nas_username: Optional[str] = None
    has_password: bool
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BackupScheduleConfigUpdate(BaseModel):
    enabled: bool
    frequency: str
    time_of_day: str
    weekday: Optional[int] = None
    retention_count: int = Field(ge=1)
    destination: Optional[str] = None
    backup_nas_username: Optional[str] = None
    # 未提供（None）則保留原密碼；傳空字串視為清除
    backup_nas_password: Optional[str] = None

    @field_validator("frequency")
    @classmethod
    def validate_frequency(cls, v: str) -> str:
        if v not in ("daily", "weekly"):
            raise ValueError("frequency 僅允許 daily 或 weekly")
        return v

    @field_validator("time_of_day")
    @classmethod
    def validate_time_of_day(cls, v: str) -> str:
        if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", v):
            raise ValueError("time_of_day 格式須為 HH:mm（24 小時）")
        return v


class BackupRecordOut(BaseModel):
    id: int
    filename: Optional[str] = None
    created_at: datetime
    size_bytes: Optional[int] = None
    status: str
    message: Optional[str] = None
    duration_ms: Optional[int] = None

    class Config:
        from_attributes = True


class BackupRecordList(BaseModel):
    items: List[BackupRecordOut]
    total: int
    page: int
    size: int
    total_pages: int


# ----------------------------------------------------------------
# 成績中心批次列印相關模型 (Batch Print Schemas) — Wave 1
# ----------------------------------------------------------------

class BatchPrintPreviewRequest(BaseModel):
    """批次列印預覽請求：依部門／計畫範圍查詢可列印成績資料。"""
    plan_ids: List[int] = Field(default_factory=list)
    dept_ids: List[int] = Field(default_factory=list)  # 空陣列 = 權限範圍內全部部門
    emp_ids: List[str] = Field(default_factory=list)   # preview 可空
    plan_status: Literal["active", "expired", "archived"] = "active"
    score_data_mode: Literal["last_attempt", "exam_history"] = "last_attempt"
    print_mode: Literal["list", "individual"] = "list"
    output_style: Literal["score_card", "summary_list"] = "summary_list"
    include_employee_signature: bool = False


class BatchPrintPdfRequest(BaseModel):
    """批次列印 PDF 下載請求：plan_ids / emp_ids 數量受護欄常數限制。"""
    plan_ids: List[int] = Field(default_factory=list)
    dept_ids: List[int] = Field(default_factory=list)
    emp_ids: List[str] = Field(default_factory=list)   # pdf 時為勾選結果
    plan_status: Literal["active", "expired", "archived"] = "active"
    score_data_mode: Literal["last_attempt", "exam_history"] = "last_attempt"
    print_mode: Literal["list", "individual"] = "list"
    output_style: Literal["score_card", "summary_list"] = "summary_list"
    include_employee_signature: bool = False


class BatchPrintIndividualRequest(BaseModel):
    """批次列印 individual 明細資料請求：可跨部門，依 plan_ids + emp_ids 取得逐人成績詳情。"""
    plan_ids: List[int] = Field(default_factory=list)
    emp_ids: List[str] = Field(default_factory=list)
    score_data_mode: Literal["last_attempt", "exam_history"] = "last_attempt"


# ----------------------------------------------------------------
# AD 整合認證相關模型 (AD Auth Schemas) — W1
# ----------------------------------------------------------------

class AdminLoginRequest(BaseModel):
    """路徑 A：AD 管理登入請求（支援 sAMAccountName 或 user@domain.com 格式）"""
    username: str = Field(..., max_length=128)
    password: str = Field(..., max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        from .constants.auth import AD_USERNAME_PATTERN, extract_sam_account
        # 支援三種格式：username、user@domain.com、DOMAIN\username
        sam = extract_sam_account(v)
        if not AD_USERNAME_PATTERN.match(sam):
            raise ValueError("AD 帳號格式不符（英數字開頭，可含 . _ -）")
        return sam.lower()


class LocalLoginRequest(BaseModel):
    """路徑 B：break-glass 本地管理員登入（僅 is_protected=true 帳號）"""
    emp_id: str = Field(..., max_length=50)
    password: str = Field(..., max_length=128)


class EmailOtpRequestBody(BaseModel):
    """路徑 D：Email OTP 備援 — 請求驗證碼（AD 斷線時才允許）"""
    username: str = Field(..., max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        from .constants.auth import AD_USERNAME_PATTERN, extract_sam_account
        sam = extract_sam_account(v)
        if not AD_USERNAME_PATTERN.match(sam):
            raise ValueError("帳號格式不符（英數字開頭，可含 . _ -）")
        return sam.lower()


class EmailOtpVerifyBody(BaseModel):
    """路徑 D：Email OTP 備援 — 驗證 OTP 並取得 JWT"""
    username: str = Field(..., max_length=128)
    otp_code: str = Field(..., min_length=6, max_length=6)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        from .constants.auth import AD_USERNAME_PATTERN, extract_sam_account
        sam = extract_sam_account(v)
        if not AD_USERNAME_PATTERN.match(sam):
            raise ValueError("帳號格式不符（英數字開頭，可含 . _ -）")
        return sam.lower()

    @field_validator("otp_code")
    @classmethod
    def validate_otp_code(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP 必須為 6 位數字")
        return v


class ChangePasswordRequest(BaseModel):
    """路徑 B：break-glass 強制改密（must_change_password=true 時觸發）"""
    emp_id: str = Field(..., max_length=50)
    change_token: str
    new_password: str = Field(..., min_length=1)


class LoginUserInfo(BaseModel):
    """登入成功後回傳的使用者資訊（嵌入 AuthLoginResponse）"""
    emp_id: str
    name: str
    dept_name: str
    role: str
    functions: List[str] = []


class AuthLoginResponse(BaseModel):
    """認證成功統一回應格式（路徑 A / B / D）"""
    access_token: str
    token_type: str = "bearer"
    auth_src: Literal["ad", "local", "email_fallback"]
    user: LoginUserInfo


class EmailOtpRequestResponse(BaseModel):
    """路徑 D：OTP 寄送成功回應"""
    masked_email: str
    expires_in_seconds: int


class MustChangePasswordResponse(BaseModel):
    """路徑 B：密碼已到期，要求前端跳轉改密頁"""
    must_change_password: bool = True
    change_token: str
