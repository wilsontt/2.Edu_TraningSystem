from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app import models

def init_db():
    db = SessionLocal()
    try:
        # 1. Ensure 'menu:admin:func' exists
        func_mgr = db.query(models.SystemFunction).filter(models.SystemFunction.code == "menu:admin:func").first()
        if not func_mgr:
            print("Creating menu:admin:func...")
            parent = db.query(models.SystemFunction).filter(models.SystemFunction.code == "menu:admin").first()
            func_mgr = models.SystemFunction(
                name="功能清單管理",
                code="menu:admin:func",
                parent_id=parent.id if parent else None,
                path="/admin/functions"
            )
            db.add(func_mgr)
        
        # 1.1 Ensure 'menu:admin:jobtitle' exists
        jobtitle_mgr = db.query(models.SystemFunction).filter(models.SystemFunction.code == "menu:admin:jobtitle").first()
        if not jobtitle_mgr:
            print("Creating menu:admin:jobtitle...")
            parent = db.query(models.SystemFunction).filter(models.SystemFunction.code == "menu:admin").first()
            jobtitle_mgr = models.SystemFunction(
                name="職務管理",
                code="menu:admin:jobtitle",
                parent_id=parent.id if parent else None,
                path="/admin/job-titles"
            )
            db.add(jobtitle_mgr)
        
        # 2. Ensure 'menu:report' exists
        report_center = db.query(models.SystemFunction).filter(models.SystemFunction.code == "menu:report").first()
        if not report_center:
            print("Creating menu:report...")
            report_center = models.SystemFunction(
                name="成績中心",
                code="menu:report",
                path="/reports"
            )
            db.add(report_center)

        db.commit()

        # 3. Assign to Admin Role
        admin_role = db.query(models.Role).filter(models.Role.name == "Admin").first()
        if admin_role:
            # Refresh functions
            current_funcs = set(admin_role.functions)
            if func_mgr and func_mgr not in current_funcs:
                print("Assigning menu:admin:func to Admin...")
                admin_role.functions.append(func_mgr)
            
            if jobtitle_mgr and jobtitle_mgr not in current_funcs:
                print("Assigning menu:admin:jobtitle to Admin...")
                admin_role.functions.append(jobtitle_mgr)
            
            if report_center and report_center not in current_funcs:
                print("Assigning menu:report to Admin...")
                admin_role.functions.append(report_center)
            
            db.commit()
            print("Admin permissions updated.")
            
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
