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
    status = Column(String, default="active")
    
    department = relationship("Department", back_populates="users")
    role = relationship("Role", back_populates="users")
    exam_records = relationship("ExamRecord", back_populates="user")

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
    training_date = Column(Date) # Start Date
    end_date = Column(Date, nullable=True) # End Date
    year = Column(String)
    timer_enabled = Column(Boolean, default=False)
    time_limit = Column(Integer, default=0)
    passing_score = Column(Integer, default=60) # 及格分數
    
    sub_category = relationship("SubCategory", back_populates="training_plans")
    location = relationship("Department", back_populates="training_plans") # 開課單位
    target_departments = relationship("Department", secondary=plan_target_departments, backref="target_plans") # 受課單位
    questions = relationship("Question", back_populates="training_plan")
    exam_records = relationship("ExamRecord", back_populates="training_plan")

class Question(Base):
    __tablename__ = "questions"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("training_plans.id"))
    content = Column(Text)
    question_type = Column(String) # 單選/是非
    options = Column(Text) # JSON 選項
    answer = Column(String)
    points = Column(Integer, default=10)
    
    training_plan = relationship("TrainingPlan", back_populates="questions")

class QuestionBank(Base):
    __tablename__ = "question_bank"
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    question_type = Column(String, nullable=False) # single, multiple, true_false
    options = Column(Text, nullable=True) # JSON string
    answer = Column(String, nullable=False)
    tags = Column(Text, nullable=True) # JSON string array
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

class ExamDetail(Base):
    __tablename__ = "exam_details"
    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("exam_records.id"))
    question_id = Column(Integer, ForeignKey("questions.id"))
    user_answer = Column(String)
    is_correct = Column(Boolean)
    
    record = relationship("ExamRecord", back_populates="details")
