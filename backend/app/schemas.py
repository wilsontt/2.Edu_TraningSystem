from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from datetime import date, datetime
import re

# --- 部門資料結構 ---
class DepartmentBase(BaseModel):
    name: str

class DepartmentCreate(DepartmentBase):
    pass

class Department(DepartmentBase):
    id: int
    user_count: int = 0

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
    token: str
    qrcode_url: str  # Base64 編碼的圖片
    expires_at: datetime

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
