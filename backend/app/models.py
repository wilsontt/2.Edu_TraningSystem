from sqlalchemy import Column, Integer, String, Text, Boolean, Date, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship, backref
from .database import Base
import datetime

# 角色與功能的關聯表
role_functions = Table(
    "role_functions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id")),
    Column("function_id", Integer, ForeignKey("system_functions.id")),
)

# 訓練計畫與受課單位的關聯表 (Many-to-Many)
plan_target_departments = Table(
    "plan_target_departments",
    Base.metadata,
    Column("plan_id", Integer, ForeignKey("training_plans.id")),
    Column("dept_id", Integer, ForeignKey("departments.id")),
)

# 訓練計畫與個人受課對象的關聯表 (Many-to-Many)
plan_target_users = Table(
    "plan_target_users",
    Base.metadata,
    Column("plan_id", Integer, ForeignKey("training_plans.id")),
    Column("emp_id", String, ForeignKey("users.emp_id")),
)

class JobTitle(Base):
    """職務（可增減）：主管、稽核、行政助理、倉儲作業、總稽核、工程師等"""
    __tablename__ = "job_titles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    sort_order = Column(Integer, default=0)
    users = relationship("User", back_populates="job_title")


class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    users = relationship("User", back_populates="department")
    training_plans = relationship("TrainingPlan", back_populates="location")

class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    users = relationship("User", back_populates="role")
    functions = relationship("SystemFunction", secondary=role_functions, back_populates="roles")

class SystemFunction(Base):
    __tablename__ = "system_functions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    code = Column(String, unique=True, index=True) # 如 menu:exam, btn:ai_gen
    parent_id = Column(Integer, ForeignKey("system_functions.id"), nullable=True)
    path = Column(String, nullable=True)
    roles = relationship("Role", secondary=role_functions, back_populates="functions")
    children = relationship("SystemFunction", 
        backref=backref("parent", remote_side=[id])
    )

class User(Base):
    __tablename__ = "users"
    emp_id = Column(String, primary_key=True, index=True) # 員工編號
    name = Column(String)
    dept_id = Column(Integer, ForeignKey("departments.id"))
    role_id = Column(Integer, ForeignKey("roles.id"))
    job_title_id = Column(Integer, ForeignKey("job_titles.id"), nullable=True)  # 職務
    status = Column(String, default="active")
    
    department = relationship("Department", back_populates="users")
    role = relationship("Role", back_populates="users")
    job_title = relationship("JobTitle", back_populates="users")
    exam_records = relationship("ExamRecord", back_populates="user")
    attendance_records = relationship("AttendanceRecord", back_populates="user")

class MainCategory(Base):
    __tablename__ = "main_categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    sub_categories = relationship("SubCategory", back_populates="main_category")

class SubCategory(Base):
    __tablename__ = "sub_categories"
    id = Column(Integer, primary_key=True, index=True)
    main_id = Column(Integer, ForeignKey("main_categories.id"))
    name = Column(String)
    main_category = relationship("MainCategory", back_populates="sub_categories")
    training_plans = relationship("TrainingPlan", back_populates="sub_category")

class TrainingPlan(Base):
    __tablename__ = "training_plans"
    id = Column(Integer, primary_key=True, index=True)
    sub_category_id = Column(Integer, ForeignKey("sub_categories.id"))
    dept_id = Column(Integer, ForeignKey("departments.id")) # 開課/上課地點
    title = Column(String)
    training_date = Column(Date) # 開始日期
    end_date = Column(Date, nullable=True) # 結束日期
    year = Column(String)
    timer_enabled = Column(Boolean, default=False)
    time_limit = Column(Integer, default=0)
    passing_score = Column(Integer, default=60) # 及格分數
    
    sub_category = relationship("SubCategory", back_populates="training_plans")
    location = relationship("Department", back_populates="training_plans") # 開課單位
    target_departments = relationship("Department", secondary=plan_target_departments, backref="target_plans") # 受課單位
    target_users = relationship("User", secondary=plan_target_users, backref="target_plans") # 個人受課對象
    questions = relationship("Question", back_populates="training_plan")
    exam_records = relationship("ExamRecord", back_populates="training_plan")
    attendance_records = relationship("AttendanceRecord", back_populates="training_plan")
    expected_attendance = Column(Integer, nullable=True)  # 應到人數（可手動修改，預設為受課部門人數）
    is_archived = Column(Boolean, default=False, nullable=False)  # 是否已封存

class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("training_plans.id"))
    content = Column(Text)
    question_type = Column(String) # 單選/是非/多選
    options = Column(Text) # JSON 選項字串
    answer = Column(String)
    points = Column(Integer, default=10)
    hint = Column(Text, nullable=True) # 提示內容（可選）
    level = Column(String(20), nullable=True) # 題目難易度 E/M/H（可選）
    
    training_plan = relationship("TrainingPlan", back_populates="questions")

class QuestionBank(Base):
    __tablename__ = "question_bank"
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    question_type = Column(String, nullable=False) # 題型: single(單選), multiple(多選), true_false(是非)
    options = Column(Text, nullable=True) # JSON 字串
    answer = Column(String, nullable=False)
    tags = Column(Text, nullable=True) # JSON 字串陣列
    hint = Column(Text, nullable=True) # 提示內容（可選）
    level = Column(String(20), nullable=True) # 題目難易度 E/M/H（可選）
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ExamRecord(Base):
    __tablename__ = "exam_records"
    id = Column(Integer, primary_key=True, index=True)
    emp_id = Column(String, ForeignKey("users.emp_id"))
    plan_id = Column(Integer, ForeignKey("training_plans.id"))
    total_score = Column(Integer)
    is_passed = Column(Boolean)
    start_time = Column(DateTime)
    submit_time = Column(DateTime)
    attempts = Column(Integer, default=1)
    
    user = relationship("User", back_populates="exam_records")
    training_plan = relationship("TrainingPlan", back_populates="exam_records")
    details = relationship("ExamDetail", back_populates="record")
    history = relationship("ExamHistory", back_populates="exam_record")

class ExamHistory(Base):
    __tablename__ = "exam_history"
    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("exam_records.id"))
    submit_time = Column(DateTime, default=datetime.datetime.utcnow)
    total_score = Column(Integer)
    is_passed = Column(Boolean)
    details = Column(Text, nullable=True) # JSON 字串，儲存考試快照
    
    exam_record = relationship("ExamRecord", back_populates="history")

class ExamDetail(Base):
    __tablename__ = "exam_details"
    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("exam_records.id"))
    question_id = Column(Integer, ForeignKey("questions.id"))
    user_answer = Column(String)
    is_correct = Column(Boolean)
    
    record = relationship("ExamRecord", back_populates="details")

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    id = Column(Integer, primary_key=True, index=True)
    emp_id = Column(String, ForeignKey("users.emp_id"))
    plan_id = Column(Integer, ForeignKey("training_plans.id"))
    checkin_time = Column(DateTime, default=datetime.datetime.utcnow)  # 報到時間
    ip_address = Column(String, nullable=True)  # 報到時的 IP（可選）
    
    user = relationship("User", back_populates="attendance_records")
    training_plan = relationship("TrainingPlan", back_populates="attendance_records")


class AttendanceAbsenceReason(Base):
    """未報到原因記錄：主管或有權限者填寫未到者原因（病假、出差、公假、其他）"""
    __tablename__ = "attendance_absence_reasons"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("training_plans.id"), nullable=False)
    emp_id = Column(String, ForeignKey("users.emp_id"), nullable=False)
    reason_code = Column(String(50), nullable=False)  # sick_leave, business_trip, official_leave, other
    reason_text = Column(String(500), nullable=True)   # 選「其他」時必填
    recorded_by = Column(String, ForeignKey("users.emp_id"), nullable=False)
    recorded_at = Column(DateTime, default=datetime.datetime.utcnow)

class LoginToken(Base):
    __tablename__ = "login_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)  # 動態產生的 token
    created_by = Column(String, ForeignKey("users.emp_id"))  # 建立者（Admin）
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime)  # 過期時間（例如：24小時後）
    used_at = Column(DateTime, nullable=True)  # 使用時間
    is_used = Column(Boolean, default=False)  # 是否已使用
