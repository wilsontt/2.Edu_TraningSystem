from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, User, Department, TrainingPlan, Question
from app.database import SQLALCHEMY_DATABASE_URL
from datetime import date, timedelta
import random

# Setup DB
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def seed_exam_data():
    try:
        # 1. Get or Create Department
        dept = db.query(Department).first()
        if not dept:
            dept = Department(name="IT Department", code="IT")
            db.add(dept)
            db.commit()
            print("Created Department: IT")

        # 2. Get or Create User (Admin)
        user = db.query(User).filter(User.emp_id == "admin").first()
        # Assume admin exists from previous setup or login, if not we skip user creation as it's handled by register API
        # But we need dept_id for match.
        if user:
            user.dept_id = dept.id
            db.commit()
            print(f"Updated User {user.name} to Dept {dept.name}")

        # 3. Create Training Plan (Exam)
        plan_title = "2026 Q1 資安意識測驗"
        plan = db.query(TrainingPlan).filter(TrainingPlan.title == plan_title).first()
        
        if not plan:
            plan = TrainingPlan(
                title=plan_title,
                # description="請完成資安意識測驗，包含社交工程防護與密碼安全。", # Not in model
                training_date=date.today(),
                end_date=date.today() + timedelta(days=30),
                dept_id=dept.id, # Assign to same dept
                # trainer="資安小組", # Not in model
                # location="線上", # Not in model, relationship to department
                timer_enabled=True,
                time_limit=10 # 10 minutes
            )
            db.add(plan)
            db.commit()
            print(f"Created Training Plan: {plan.title}")
            
            # 4. Create Questions
            questions = [
                Question(
                    plan_id=plan.id,
                    content="以下哪個密碼最安全？",
                    question_type="single",
                    options='{"A": "123456", "B": "password", "C": "P@ssw0rd_2026!", "D": "admin"}',
                    answer="C",
                    points=20
                ),
                Question(
                    plan_id=plan.id,
                    content="收到不明來源的郵件連結，應該？",
                    question_type="single",
                    options='{"A": "直接點開", "B": "轉寄給同事", "C": "忽略或回報給IT", "D": "回信詢問"}',
                    answer="C",
                    points=20
                ),
                Question(
                    plan_id=plan.id,
                    content="離開座位時，電腦應該？",
                    question_type="single",
                    options='{"A": "保持開啟", "B": "鎖定螢幕 (Win+L)", "C": "關閉螢幕", "D": "不需理會"}',
                    answer="B",
                    points=20
                )
            ]
            db.add_all(questions)
            db.commit()
            print(f"Created {len(questions)} questions for plan.")
            
        else:
            print("Training Plan already exists.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_exam_data()
