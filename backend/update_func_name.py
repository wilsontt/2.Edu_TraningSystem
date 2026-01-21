import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import SystemFunction

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
