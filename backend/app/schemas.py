from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime

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

class TrainingPlan(TrainingPlanBase):
    id: int
    year: Optional[str] = None # 改為可選
    target_departments: List['Department'] = [] # 回傳受課單位詳情
    
    class Config:
        from_attributes = True

# --- 用戶與認證擴充 ---
class UserBase(BaseModel):
    emp_id: str
    name: str

class UserCreate(UserBase):
    dept_id: int
    password: Optional[str] = None # 註冊時使用（如有需要）

class UserUpdate(BaseModel):
    name: Optional[str] = None
    dept_id: Optional[int] = None
    role_id: Optional[int] = None
    status: Optional[str] = None

class User(UserBase):
    dept_id: int
    role_id: Optional[int] = None
    status: str
    
    # 關聯欄位，方便前端顯示
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

class QuestionCreate(QuestionBase):
    plan_id: int

class QuestionUpdate(BaseModel):
    content: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[str] = None
    answer: Optional[str] = None
    points: Optional[int] = None

class Question(QuestionBase):
    id: int
    plan_id: int
    
    class Config:
        from_attributes = True

# 更新遞迴模型的向前參照
SystemFunction.update_forward_refs()
