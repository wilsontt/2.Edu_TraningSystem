from sqlalchemy import Column, Integer, String, Text, Boolean, Date, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship, backref
from .database import Base
import datetime

# ----------------------------------------------------------------
# 多對多關聯中間表 (Many-to-Many Association Tables)
# ----------------------------------------------------------------

# 角色與功能的關聯表：定義哪些角色擁有哪些系統功能的操作權限
role_functions = Table(
    "role_functions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id")),
    Column("function_id", Integer, ForeignKey("system_functions.id")),
)

# 訓練計畫與受課單位的關聯表：一個計畫可發佈給多個部門，一個部門可參與多個計畫
plan_target_departments = Table(
    "plan_target_departments",
    Base.metadata,
    Column("plan_id", Integer, ForeignKey("training_plans.id")),
    Column("dept_id", Integer, ForeignKey("departments.id")),
)

# 訓練計畫與個人受課對象的關聯表：一個計畫可單獨發佈給特定人員
plan_target_users = Table(
    "plan_target_users",
    Base.metadata,
    Column("plan_id", Integer, ForeignKey("training_plans.id")),
    Column("emp_id", String, ForeignKey("users.emp_id")),
)

# ----------------------------------------------------------------
# 組織架構模型 (Organization Models)
# ----------------------------------------------------------------

class JobTitle(Base):
    """職務模型：定義人員的職稱（如：工程師、主管、倉儲作業等）"""
    __tablename__ = "job_titles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # 職稱名稱
    sort_order = Column(Integer, default=0) # 顯示排序
    users = relationship("User", back_populates="job_title")


class Department(Base):
    """部門/單位模型：定義組織內的各個部門"""
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # 部門名稱
    users = relationship("User", back_populates="department")
    training_plans = relationship("TrainingPlan", back_populates="location")

class Role(Base):
    """角色模型：RBAC 權限管理的核心角色（如：Admin, User, Manager）"""
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True) # 角色名稱
    users = relationship("User", back_populates="role")
    # 關聯系統功能 (多對多)
    functions = relationship("SystemFunction", secondary=role_functions, back_populates="roles")
    # 管理權限範圍：定義此角色可管理的部門範圍
    department_scopes = relationship(
        "RoleDepartmentScope",
        back_populates="role",
        cascade="all, delete-orphan",
    )
    department_scope_departments = relationship(
        "RoleDepartmentScopeDept",
        back_populates="role",
        cascade="all, delete-orphan",
    )


class RoleDepartmentScope(Base):
    """角色部門權限範圍類型：all(全公司), department(所屬部門), self(僅個人)"""
    __tablename__ = "role_department_scope_map"
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)
    scope_type = Column(String, nullable=False, default="self")  # all | department | self
    role = relationship("Role", back_populates="department_scopes")


class RoleDepartmentScopeDept(Base):
    """特定管理部門關聯：當 scope_type 為自定義部門時使用"""
    __tablename__ = "role_department_scope_depts"
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)
    dept_id = Column(Integer, ForeignKey("departments.id"), primary_key=True)

    role = relationship("Role", back_populates="department_scope_departments")
    department = relationship("Department")

class SystemFunction(Base):
    """系統功能/選單模型：定義選單、按鈕等功能節點與權限代碼"""
    __tablename__ = "system_functions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String) # 功能名稱 (如：考試中心)
    code = Column(String, unique=True, index=True) # 功能唯一代碼 (如：menu:exam)
    parent_id = Column(Integer, ForeignKey("system_functions.id"), nullable=True) # 支援樹狀結構
    path = Column(String, nullable=True) # 前端路由路徑
    roles = relationship("Role", secondary=role_functions, back_populates="functions")
    children = relationship("SystemFunction", 
        backref=backref("parent", remote_side=[id])
    )

class User(Base):
    """使用者模型：儲存人員基本資料與其關聯之部門、角色、職務"""
    __tablename__ = "users"
    emp_id = Column(String, primary_key=True, index=True) # 員工編號 (登入唯一識別)
    name = Column(String) # 姓名
    dept_id = Column(Integer, ForeignKey("departments.id")) # 所屬部門
    role_id = Column(Integer, ForeignKey("roles.id")) # 系統角色
    job_title_id = Column(Integer, ForeignKey("job_titles.id"), nullable=True) # 職稱
    status = Column(String, default="active") # 帳號狀態 (active/inactive)
    
    department = relationship("Department", back_populates="users")
    role = relationship("Role", back_populates="users")
    job_title = relationship("JobTitle", back_populates="users")
    exam_records = relationship("ExamRecord", back_populates="user")
    attendance_records = relationship("AttendanceRecord", back_populates="user")

# ----------------------------------------------------------------
# 訓練管理模型 (Training Models)
# ----------------------------------------------------------------

class MainCategory(Base):
    """訓練課程大項目 (如：安衛訓練、專業技能)"""
    __tablename__ = "main_categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    sub_categories = relationship("SubCategory", back_populates="main_category")

class SubCategory(Base):
    """訓練課程細項目 (如：消防演練、作業環境監測)"""
    __tablename__ = "sub_categories"
    id = Column(Integer, primary_key=True, index=True)
    main_id = Column(Integer, ForeignKey("main_categories.id"))
    name = Column(String)
    main_category = relationship("MainCategory", back_populates="sub_categories")
    training_plans = relationship("TrainingPlan", back_populates="sub_category")

class TrainingPlan(Base):
    """訓練計畫核心：定義計畫內容、對象、及格標準及時間"""
    __tablename__ = "training_plans"
    id = Column(Integer, primary_key=True, index=True)
    sub_category_id = Column(Integer, ForeignKey("sub_categories.id"))
    dept_id = Column(Integer, ForeignKey("departments.id")) # 開課地點/單位
    title = Column(String) # 計畫標題
    training_date = Column(Date) # 計畫開始日期
    end_date = Column(Date, nullable=True) # 計畫結束日期
    year = Column(String) # 年度 (統計用)
    timer_enabled = Column(Boolean, default=False) # 是否啟用限時考試
    time_limit = Column(Integer, default=0) # 時限 (分鐘)
    passing_score = Column(Integer, default=60) # 及格門檻
    
    sub_category = relationship("SubCategory", back_populates="training_plans")
    location = relationship("Department", back_populates="training_plans")
    target_departments = relationship("Department", secondary=plan_target_departments, backref="target_plans")
    target_users = relationship("User", secondary=plan_target_users, backref="target_plans")
    questions = relationship("Question", back_populates="training_plan")
    exam_records = relationship("ExamRecord", back_populates="training_plan")
    attendance_records = relationship("AttendanceRecord", back_populates="training_plan")
    expected_attendance = Column(Integer, nullable=True)  # 應到人數
    is_archived = Column(Boolean, default=False, nullable=False)  # 是否封存

# ----------------------------------------------------------------
# 題目與考試模型 (Exam Models)
# ----------------------------------------------------------------

class Question(Base):
    """考卷題目：隸屬於特定訓練計畫的題目內容"""
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("training_plans.id"))
    content = Column(Text) # 題目本文
    question_type = Column(String) # 題型 (single/multiple/true_false)
    options = Column(Text) # JSON 格式選項
    answer = Column(String) # 正確答案
    points = Column(Integer, default=10) # 該題配分
    hint = Column(Text, nullable=True) # 題目提示
    level = Column(String(20), nullable=True) # 難易度
    
    training_plan = relationship("TrainingPlan", back_populates="questions")

class QuestionBank(Base):
    """全域題庫：可用於跨計畫匯入的獨立題目庫"""
    __tablename__ = "question_bank"
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    question_type = Column(String, nullable=False)
    options = Column(Text, nullable=True)
    answer = Column(String, nullable=False)
    tags = Column(Text, nullable=True) # JSON 格式標籤
    hint = Column(Text, nullable=True)
    level = Column(String(20), nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ExamRecord(Base):
    """考試總記錄：員工單次計畫的最終作答總結"""
    __tablename__ = "exam_records"
    id = Column(Integer, primary_key=True, index=True)
    emp_id = Column(String, ForeignKey("users.emp_id"))
    plan_id = Column(Integer, ForeignKey("training_plans.id"))
    total_score = Column(Integer) # 總得分
    is_passed = Column(Boolean) # 是否及格
    start_time = Column(DateTime) # 開始作答時間
    submit_time = Column(DateTime) # 提交時間
    attempts = Column(Integer, default=1) # 作答次數
    
    user = relationship("User", back_populates="exam_records")
    training_plan = relationship("TrainingPlan", back_populates="exam_records")
    details = relationship("ExamDetail", back_populates="record")
    history = relationship("ExamHistory", back_populates="exam_record")

class ExamHistory(Base):
    """考試歷史軌跡：紀錄使用者多次作答的歷史快照"""
    __tablename__ = "exam_history"
    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("exam_records.id"))
    submit_time = Column(DateTime, default=datetime.datetime.utcnow)
    total_score = Column(Integer)
    is_passed = Column(Boolean)
    details = Column(Text, nullable=True) # 該次作答的完整 JSON 快照
    
    exam_record = relationship("ExamRecord", back_populates="history")

class ExamDetail(Base):
    """考試每題詳情：紀錄使用者對單一題目的答案與對錯"""
    __tablename__ = "exam_details"
    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("exam_records.id"))
    question_id = Column(Integer, ForeignKey("questions.id"))
    user_answer = Column(String) # 使用者填寫答案
    is_correct = Column(Boolean) # 是否答對
    
    record = relationship("ExamRecord", back_populates="details")

class AttendanceRecord(Base):
    """報到紀錄：員工於訓練開始前的報到資訊"""
    __tablename__ = "attendance_records"
    id = Column(Integer, primary_key=True, index=True)
    emp_id = Column(String, ForeignKey("users.emp_id"))
    plan_id = Column(Integer, ForeignKey("training_plans.id"))
    checkin_time = Column(DateTime, default=datetime.datetime.utcnow) # 報到時間
    ip_address = Column(String, nullable=True)
    
    user = relationship("User", back_populates="attendance_records")
    training_plan = relationship("TrainingPlan", back_populates="attendance_records")


class AttendanceAbsenceReason(Base):
    """未到原因說明：針對應到而未報到的人員，紀錄理由 (病假、出差等)"""
    __tablename__ = "attendance_absence_reasons"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("training_plans.id"), nullable=False)
    emp_id = Column(String, ForeignKey("users.emp_id"), nullable=False)
    reason_code = Column(String(50), nullable=False) # 原因代碼 (sick_leave/official_leave...)
    reason_text = Column(String(500), nullable=True) # 詳細描述
    recorded_by = Column(String, ForeignKey("users.emp_id"), nullable=False)
    recorded_at = Column(DateTime, default=datetime.datetime.utcnow)

class LoginToken(Base):
    """QRcode 登入 Token：用於生成限時有效的登入 QRcode"""
    __tablename__ = "login_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)
    created_by = Column(String, ForeignKey("users.emp_id"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime) # 過期時間
    used_at = Column(DateTime, nullable=True)
    is_used = Column(Boolean, default=False)


class MaterialType(Base):
    """教材類型主檔（操作手冊、法規與標準等）；slug 用於 NAS 子目錄。"""
    __tablename__ = "material_types"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)          # 類型名稱
    slug = Column(String, unique=True)          # 目錄用識別
    sort_order = Column(Integer, default=0)     # 排序
    max_file_bytes = Column(Integer, nullable=True)  # 該類型單檔上限；null 用系統預設
    is_active = Column(Boolean, default=True)


class TeachingMaterial(Base):
    """教材目錄卡（DB 中繼資料）；實體檔存於 NAS（見教材 PLAN §5.2.2）。"""
    __tablename__ = "teaching_materials"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("training_plans.id"), index=True)
    title = Column(String)
    material_type_id = Column(Integer, ForeignKey("material_types.id"))
    description = Column(String, nullable=True)
    tags = Column(Text, nullable=True)              # JSON 字串（格式同題庫）
    original_filename = Column(String)             # 上傳原始檔名（下載檔名來源）
    stored_filename = Column(String)              # NAS 檔名，例 42.pdf
    storage_path = Column(String)                 # 相對 MATERIALS_ROOT 的完整路徑
    file_format = Column(String)                  # pdf、docx、md、txt 等
    file_size_bytes = Column(Integer)
    year = Column(String)                         # 由計畫帶入
    sub_category_id = Column(Integer, nullable=True)  # 計畫分類快照，供跨計畫篩選
    uploaded_by = Column(String)                  # emp_id
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    is_active = Column(Boolean, default=True, index=True)
    deactivated_at = Column(DateTime, nullable=True)
    deactivated_by = Column(String, nullable=True)
    replaced_by_id = Column(Integer, ForeignKey("teaching_materials.id"), nullable=True)
    replaces_id = Column(Integer, ForeignKey("teaching_materials.id"), nullable=True)

    material_type = relationship("MaterialType")


class FileTransferAuditLog(Base):
    """檔案傳輸稽核：記錄考卷／教材之上傳、下載、刪除等傳輸行為（見建議事項 PLAN §7.1）。"""
    __tablename__ = "file_transfer_audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    emp_id = Column(String, index=True)            # 教育訓練系統使用者（JWT）
    client_ip = Column(String, nullable=True)      # 來源 IP
    nas_username = Column(String, nullable=True)   # 互動傳輸之 NAS 帳號；考卷為 null 或 'service'
    action = Column(String)                        # upload / download / delete / cancel
    resource_type = Column(String)                 # teaching_material / exam_txt
    resource_id = Column(Integer, nullable=True)   # 教材 id 等
    plan_id = Column(Integer, nullable=True)       # 訓練計畫
    filename = Column(String)                      # 原始檔名
    bytes = Column(Integer, nullable=True)         # 傳輸大小
    status = Column(String)                        # success / failed / cancelled
    error_message = Column(Text, nullable=True)    # 失敗原因
