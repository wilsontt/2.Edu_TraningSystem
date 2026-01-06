from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas
from ..database import get_db
from .auth import check_permission

router = APIRouter(prefix="/admin", tags=["admin"])

# --- Department CRUD ---
@router.get("/departments", response_model=List[schemas.Department])
def get_departments(db: Session = Depends(get_db), current_user = check_permission("menu:admin:dept")):
    departments = db.query(models.Department).all()
    # Add counts
    for dept in departments:
        dept.user_count = len(dept.users)
    return departments

@router.post("/departments", response_model=schemas.Department)
def create_department(dept: schemas.DepartmentCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin:dept")):
    db_dept = models.Department(name=dept.name)
    db.add(db_dept)
    try:
        db.commit()
        db.refresh(db_dept)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="單位名稱可能已存在")
    return db_dept

@router.put("/departments/{id}", response_model=schemas.Department)
def update_department(id: int, dept: schemas.DepartmentCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin:dept")):
    db_dept = db.query(models.Department).filter(models.Department.id == id).first()
    if not db_dept:
        raise HTTPException(status_code=404, detail="單位不存在")
    db_dept.name = dept.name
    try:
        db.commit()
        db.refresh(db_dept)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="單位名稱可能與其他單位重複")
    return db_dept

@router.delete("/departments/{id}")
def delete_department(id: int, db: Session = Depends(get_db), current_user = check_permission("menu:admin:dept")):
    db_dept = db.query(models.Department).filter(models.Department.id == id).first()
    if not db_dept:
        raise HTTPException(status_code=404, detail="單位不存在")
    
    # 檢查是否有使用者關連
    if db_dept.users:
        raise HTTPException(status_code=400, detail="該單位尚有使用者，無法刪除")
    
    db.delete(db_dept)
    db.commit()
    return {"message": "刪除成功"}

# --- Department Users ---
@router.get("/departments/{id}/users")
def get_department_users(id: int, db: Session = Depends(get_db), current_user = check_permission("menu:admin:dept")):
    """獲取特定部門的所有使用者"""
    db_dept = db.query(models.Department).filter(models.Department.id == id).first()
    if not db_dept:
        raise HTTPException(status_code=404, detail="單位不存在")
    
    users = []
    for user in db_dept.users:
        users.append({
            "emp_id": user.emp_id,
            "name": user.name,
            "role": user.role.name if user.role else "未設定",
            "status": user.status
        })
    
    return {
        "department_id": id,
        "department_name": db_dept.name,
        "user_count": len(users),
        "users": users
    }

# --- Category CRUD ---
@router.get("/categories/main", response_model=List[schemas.MainCategory])
def get_main_categories(db: Session = Depends(get_db), current_user = check_permission("menu:plan")):
    """獲取所有大項目清單（含其下的細項目）"""
    return db.query(models.MainCategory).all()

@router.post("/categories/main", response_model=schemas.MainCategory)
def create_main_category(category: schemas.MainCategoryCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin")):
    """新增一個大項目"""
    db_category = models.MainCategory(name=category.name)
    db.add(db_category)
    try:
        db.commit()
        db.refresh(db_category)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="大項目名稱可能已存在")
    return db_category

@router.get("/categories/sub/{main_id}", response_model=List[schemas.SubCategory])
def get_sub_categories(main_id: int, db: Session = Depends(get_db), current_user = check_permission("menu:plan")):
    """獲取特定大項目下的所有細項目"""
    main_cat = db.query(models.MainCategory).filter(models.MainCategory.id == main_id).first()
    if not main_cat:
        raise HTTPException(status_code=404, detail="大項目不存在")
    return main_cat.sub_categories

@router.put("/categories/main/{id}", response_model=schemas.MainCategory)
def update_main_category(id: int, category: schemas.MainCategoryCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin")):
    """更新大項目"""
    db_category = db.query(models.MainCategory).filter(models.MainCategory.id == id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="大項目不存在")
    db_category.name = category.name
    try:
        db.commit()
        db.refresh(db_category)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="大項目更新失敗")
    return db_category

@router.post("/categories/sub", response_model=schemas.SubCategory)
def create_sub_category(category: schemas.SubCategoryCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin")):
    """在指定大項目下新增細項目"""
    # 檢查大項目是否存在
    main_cat = db.query(models.MainCategory).filter(models.MainCategory.id == category.main_id).first()
    if not main_cat:
        raise HTTPException(status_code=404, detail="大項目不存在")
    
    db_sub_category = models.SubCategory(name=category.name, main_id=category.main_id)
    db.add(db_sub_category)
    try:
        db.commit()
        db.refresh(db_sub_category)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="細項目新增失敗")
    return db_sub_category

@router.put("/categories/sub/{id}", response_model=schemas.SubCategory)
def update_sub_category(id: int, category: schemas.SubCategoryCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin")):
    """更新細項目"""
    db_sub_category = db.query(models.SubCategory).filter(models.SubCategory.id == id).first()
    if not db_sub_category:
        raise HTTPException(status_code=404, detail="細項目不存在")
    db_sub_category.name = category.name
    db_sub_category.main_id = category.main_id
    try:
        db.commit()
        db.refresh(db_sub_category)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="細項目更新失敗")
    return db_sub_category

@router.delete("/categories/main/{id}")
def delete_main_category(id: int, db: Session = Depends(get_db), current_user = check_permission("menu:admin")):
    """刪除大項目 (需無細項目依賴)"""
    db_category = db.query(models.MainCategory).filter(models.MainCategory.id == id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="大項目不存在")
    
    if db_category.sub_categories:
        raise HTTPException(status_code=400, detail="改大項目下尚有細項目，無法刪除")
    
    db.delete(db_category)
    db.commit()
    return {"message": "刪除成功"}

@router.delete("/categories/sub/{id}")
def delete_sub_category(id: int, db: Session = Depends(get_db), current_user = check_permission("menu:admin")):
    """刪除細項目 (需無計畫依賴)"""
    db_sub_category = db.query(models.SubCategory).filter(models.SubCategory.id == id).first()
    if not db_sub_category:
        raise HTTPException(status_code=404, detail="細項目不存在")
    
    if db_sub_category.training_plans:
        raise HTTPException(status_code=400, detail="該細項目已被訓練計畫使用，無法刪除")
    
    db.delete(db_sub_category)
    db.commit()
    return {"message": "刪除成功"}

# --- User Management ---
@router.get("/users", response_model=List[schemas.UserDetail])
def get_users(db: Session = Depends(get_db), current_user = check_permission("menu:admin:user")):
    """取得所有使用者"""
    return db.query(models.User).all()

@router.put("/users/{emp_id}", response_model=schemas.UserDetail)
def update_user(emp_id: str, user_update: schemas.UserUpdate, db: Session = Depends(get_db), current_user = check_permission("menu:admin:user")):
    """更新使用者資料 (角色、單位、狀態)"""
    db_user = db.query(models.User).filter(models.User.emp_id == emp_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="使用者不存在")
    
    if user_update.name is not None:
        db_user.name = user_update.name
    if user_update.dept_id is not None:
        db_user.dept_id = user_update.dept_id
    if user_update.role_id is not None:
        db_user.role_id = user_update.role_id
    if user_update.status is not None:
        if emp_id.lower() == 'admin' and user_update.status != 'active':
            raise HTTPException(status_code=400, detail="系統預設管理員不能被停用")
        db_user.status = user_update.status
        
    try:
        db.commit()
        db.refresh(db_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="更新失敗")
    return db_user

# --- Role Management ---
@router.get("/roles", response_model=List[schemas.Role])
def get_roles(db: Session = Depends(get_db), current_user = check_permission("menu:admin:role")):
    """取得所有角色"""
    roles = db.query(models.Role).all()
    # Add counts (SQLAlchemy relationship lazy loading makes this easy, though not most efficient for huge datasets)
    for role in roles:
        role.user_count = len(role.users)
        role.function_count = len(role.functions)
    return roles

@router.post("/roles", response_model=schemas.Role)
def create_role(role: schemas.RoleCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin:role")):
    """新增角色"""
    db_role = models.Role(name=role.name)
    db.add(db_role)
    try:
        db.commit()
        db.refresh(db_role)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="角色名稱可能重複")
    return db_role

# --- Permission Management ---
@router.get("/functions", response_model=List[schemas.SystemFunction])
def get_functions(db: Session = Depends(get_db), current_user = check_permission("menu:admin")):
    """取得所有系統功能"""
    return db.query(models.SystemFunction).filter(models.SystemFunction.parent_id == None).all()

@router.get("/roles/{role_id}/permissions", response_model=List[int])
def get_role_permissions(role_id: int, db: Session = Depends(get_db), current_user = check_permission("menu:admin:perm")):
    """取得特定角色的功能 ID 列表"""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return [f.id for f in role.functions]

@router.post("/functions", response_model=schemas.SystemFunction)
async def create_system_function(func: schemas.SystemFunctionCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin:func")):
    """新增系統功能"""
    # 檢查是否已存在相同的 code
    existing = db.query(models.SystemFunction).filter(models.SystemFunction.code == func.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="功能代碼 (Code) 已存在")

    db_func = models.SystemFunction(
        name=func.name,
        code=func.code,
        parent_id=func.parent_id,
        path=func.path
    )
    db.add(db_func)
    try:
        db.commit()
        db.refresh(db_func)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="新增失敗，可能是代碼重複")
    return db_func



@router.put("/functions/{id}", response_model=schemas.SystemFunction)
async def update_function(id: int, func: schemas.SystemFunctionCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin:func")):
    """更新系統功能"""
    db_func = db.query(models.SystemFunction).filter(models.SystemFunction.id == id).first()
    if not db_func:
        raise HTTPException(status_code=404, detail="功能不存在")
    
    # 檢查 Code 使否與其他重複
    existing = db.query(models.SystemFunction).filter(models.SystemFunction.code == func.code, models.SystemFunction.id != id).first()
    if existing:
        raise HTTPException(status_code=400, detail="功能代碼 (Code) 已被其他功能使用")

    # update fields
    db_func.name = func.name
    db_func.code = func.code
    db_func.parent_id = func.parent_id
    db_func.path = func.path

    try:
        db.commit()
        db.refresh(db_func)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="更新失敗")
    return db_func

@router.delete("/functions/{id}")
async def delete_function(id: int, db: Session = Depends(get_db), current_user = check_permission("menu:admin:func")):
    """刪除系統功能 (需無子節點)"""
    db_func = db.query(models.SystemFunction).filter(models.SystemFunction.id == id).first()
    if not db_func:
        raise HTTPException(status_code=404, detail="功能不存在")
    
    # 檢查是否有子節點
    if db_func.children:
        raise HTTPException(status_code=400, detail="該功能尚有子節點，無法刪除")
    
    # 檢查是否被角色引用 (Many-to-Many 刪除時通常只移除關聯，但這裡為了安全，提醒使用者先移除角色權限比較好，或者自動移除)
    # 這裡我們自動移除關聯 (SQLAlchemy default cascade might not set, let's explicit check or just delete)
    # models.role_functions table is not mapped as a class, but relationship secondary handles it.
    
    # Let's check roles count first
    if db_func.roles:
        raise HTTPException(status_code=400, detail="該功能已被指派給角色，請先移除角色權限")

    db.delete(db_func)
    db.commit()
    return {"message": "刪除成功"}

@router.put("/roles/{role_id}/permissions")
def update_role_permissions(role_id: int, update: schemas.RolePermissionUpdate, db: Session = Depends(get_db), current_user = check_permission("menu:admin:perm")):
    """更新角色權限"""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    
    # 清除舊權限
    role.functions = []
    
    # 加入新權限
    if update.function_ids:
        functions = db.query(models.SystemFunction).filter(models.SystemFunction.id.in_(update.function_ids)).all()
        role.functions = functions
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="權限更新失敗")
    
    return {"message": "權限更新成功"}
