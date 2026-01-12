from sqlalchemy.orm import Session
from .database import SessionLocal, engine, Base
from . import models

def init_db():
    # 建立所有資料表
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 1. 建立基礎角色
        admin_role = db.query(models.Role).filter(models.Role.name == "Admin").first()
        if not admin_role:
            admin_role = models.Role(name="Admin")
            db.add(admin_role)
            
        user_role = db.query(models.Role).filter(models.Role.name == "User").first()
        if not user_role:
            user_role = models.Role(name="User")
            db.add(user_role)
        
        db.commit()
        db.refresh(admin_role)
        db.refresh(user_role)
        
        # 2. 建立基礎部門
        it_dept = db.query(models.Department).filter(models.Department.name == "IT部").first()
        if not it_dept:
            it_dept = models.Department(name="IT部")
            db.add(it_dept)
        
        db.commit()
        db.refresh(it_dept)
        
        # 3. 建立基礎功能選單
        functions = [
            {"name": "首頁", "code": "menu:home", "path": "/", "parent_id": 0},
            {"name": "訓練計畫", "code": "menu:plan", "path": "/plans", "parent_id": 0},
            {"name": "考卷工坊", "code": "menu:exam", "path": "/exams", "parent_id": 0},
            {"name": "成績中心", "code": "menu:report", "path": "/reports", "parent_id": 0},
            {"name": "系統管理", "code": "menu:admin", "path": "/admin", "parent_id": 0},
        ]
        
        db_functions = {}
        for f in functions:
            func = db.query(models.SystemFunction).filter(models.SystemFunction.code == f["code"]).first()
            if not func:
                func = models.SystemFunction(name=f["name"], code=f["code"], path=f["path"])
                db.add(func)
                db.commit()
                db.refresh(func)
            db_functions[f["code"]] = func
            
        # 子功能
        admin_sub = [
            {"name": "單位管理", "code": "menu:admin:dept", "path": "/admin/departments", "parent_id": db_functions["menu:admin"].id},
            {"name": "人員管理", "code": "menu:admin:user", "path": "/admin/users", "parent_id": db_functions["menu:admin"].id},
            {"name": "角色管理", "code": "menu:admin:role", "path": "/admin/roles", "parent_id": db_functions["menu:admin"].id},
            {"name": "權限管理", "code": "menu:admin:perm", "path": "/admin/permissions", "parent_id": db_functions["menu:admin"].id},
            {"name": "功能清單管理", "code": "menu:admin:func", "path": "/admin/functions", "parent_id": db_functions["menu:admin"].id},
        ]
        
        for f in admin_sub:
            func = db.query(models.SystemFunction).filter(models.SystemFunction.code == f["code"]).first()
            if not func:
                func = models.SystemFunction(name=f["name"], code=f["code"], path=f["path"], parent_id=f["parent_id"])
                db.add(func)
        
        db.commit()
        
        # 4. 配置角色權限 (Admin 擁有所有權限, User 擁有首頁與成績中心)
        all_funcs = db.query(models.SystemFunction).all()
        admin_role.functions = all_funcs
        
        user_role_funcs = [
            db_functions["menu:home"],
            db_functions["menu:report"]
        ]
        user_role.functions = user_role_funcs
        
        db.commit()
        
        # 5. 建立預設訓練分類
        categories_data = [
            {"name": "製程技術", "subs": ["CNC加工", "焊接技術", "品質檢驗"]},
            {"name": "工業安全", "subs": ["急救訓練", "消防演習", "職業安全衛生"]},
            {"name": "管理職能", "subs": ["團隊領導", "專案管理", "時間管理"]}
        ]
        
        for cat_data in categories_data:
            # 檢查大項目是否存在
            main_cat = db.query(models.MainCategory).filter(models.MainCategory.name == cat_data["name"]).first()
            if not main_cat:
                main_cat = models.MainCategory(name=cat_data["name"])
                db.add(main_cat)
                db.commit()
                db.refresh(main_cat)
                
                # 新增細項目
                for sub_name in cat_data["subs"]:
                    sub_cat = models.SubCategory(name=sub_name, main_id=main_cat.id)
                    db.add(sub_cat)
                
                db.commit()

        # 6. 建立預設管理員帳號（如果不存在）
        admin_user = db.query(models.User).filter(models.User.emp_id == "admin").first()
        if not admin_user:
            admin_user = models.User(
                emp_id="admin",
                name="系統管理員",
                dept_id=it_dept.id,
                role_id=admin_role.id,
                status="active"
            )
            db.add(admin_user)
            db.commit()
            print("Created default admin user: admin")
        else:
            print(f"Admin user already exists: {admin_user.emp_id}")
        
        print("Database initialized successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Error initializing database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
