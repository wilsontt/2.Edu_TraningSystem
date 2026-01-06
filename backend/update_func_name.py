from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import SystemFunction
from app.database import SQLALCHEMY_DATABASE_URL

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def fix_system_function_name():
    try:
        # Find 'menu:home' and rename to '考試中心'
        func = db.query(SystemFunction).filter(SystemFunction.code == "menu:home").first()
        if func:
            print(f"Found function: {func.name} ({func.code})")
            func.name = "考試中心"
            db.commit()
            print("Renamed to: 考試中心")
        else:
            print("Function 'menu:home' not found.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_system_function_name()
