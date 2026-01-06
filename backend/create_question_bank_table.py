from app.database import engine, Base
from app.models import QuestionBank
from sqlalchemy import text

def migrate():
    print("Creating question_bank table...")
    # Use simple create_all for new table, it checks existence safely
    QuestionBank.__table__.create(bind=engine, checkfirst=True)
    print("Done.")

if __name__ == "__main__":
    migrate()
