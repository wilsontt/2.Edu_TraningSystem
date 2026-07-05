
import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app import models

# 確保資料表存在
Base.metadata.create_all(bind=engine)

def seed_data():
    db: Session = SessionLocal()
    try:
        print("開始生成測試資料...")

        # 1. 獲取基礎資料
        users = db.query(models.User).all()
        plans = db.query(models.TrainingPlan).all()
        questions = db.query(models.Question).all()

        if not users or not plans:
            print("錯誤: 請先建立使用者與訓練計畫 (Users/TrainingPlans)")
            return

        print(f"現有使用者: {len(users)} 位")
        print(f"現有計畫: {len(plans)} 個")

        # 2. 為每個計畫生成考試紀錄
        records_count = 0
        for plan in plans:
            # 找出該計畫對應的題目 (若無題目則跳過)
            plan_questions = [q for q in questions if q.plan_id == plan.id]
            if not plan_questions:
                # 若該計畫沒題目，跳過
                continue

            # 隨機挑選一些使用者來參加這個考試 (例如 80% 的人)
            participants = random.sample(users, k=int(len(users) * 0.8))
            
            for user in participants:
                # 決定是否及格 (隨機 70% 及格率)
                passed = random.random() < 0.7
                
                # 計算分數
                # 假設滿分 100，若及格分數在 60-100，不及格在 0-59
                total_score = random.randint(60, 100) if passed else random.randint(30, 59)
                
                # 考試時間
                base_time = datetime.now() - timedelta(days=random.randint(0, 30))
                start_time = base_time
                submit_time = base_time + timedelta(minutes=random.randint(10, 45))

                # 建立 Record
                record = models.ExamRecord(
                    emp_id=user.emp_id,
                    plan_id=plan.id,
                    total_score=total_score,
                    is_passed=passed,
                    start_time=start_time,
                    submit_time=submit_time
                )
                db.add(record)
                db.commit() # Commit to get record.id
                db.refresh(record)
                records_count += 1

                # 建立 ExamDetail (假裝回答)
                # 這裡簡單生成，分數與 total_score 未必精確對應，僅供統計報表測試筆數用
                for q in plan_questions:
                    is_correct = random.random() > 0.3 # 70% 答對率
                    detail = models.ExamDetail(
                        record_id=record.id,
                        question_id=q.id,
                        user_answer="A" if is_correct else "B", # 假答案
                        is_correct=is_correct
                    )
                    db.add(detail)
        
        db.commit()
        print(f"成功生成 {records_count} 筆考試紀錄與相關明細。")

    except Exception as e:
        print(f"發生錯誤: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
