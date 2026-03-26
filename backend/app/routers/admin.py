from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session, joinedload
from typing import List
from .. import models, schemas
from ..database import get_db
from .auth import check_permission

router = APIRouter(prefix="/admin", tags=["admin"])

# --- 單位管理 (CRUD) ---
@router.get("/departments", response_model=List[schemas.Department])
def get_departments(db: Session = Depends(get_db), current_user = check_permission("menu:admin:dept")):
    departments = db.query(models.Department).all()
    # 新增統計數據
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

# --- 單位使用者管理 ---
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

# --- 分類管理 (CRUD) ---
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

# --- 職務管理 (Job Titles) ---
@router.get("/job-titles", response_model=List[schemas.JobTitle])
def get_job_titles(db: Session = Depends(get_db), current_user=check_permission("menu:admin:jobtitle")):
    """取得所有職務（用於人員管理編輯與職務維護）"""
    return db.query(models.JobTitle).order_by(models.JobTitle.sort_order, models.JobTitle.id).all()


@router.post("/job-titles", response_model=schemas.JobTitle)
def create_job_title(body: schemas.JobTitleCreate, db: Session = Depends(get_db), current_user=check_permission("menu:admin:jobtitle")):
    """新增職務"""
    existing = db.query(models.JobTitle).filter(models.JobTitle.name == body.name.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="職務名稱已存在")
    max_order = db.query(models.JobTitle).count()
    obj = models.JobTitle(name=body.name.strip(), sort_order=max_order)
    db.add(obj)
    try:
        db.commit()
        db.refresh(obj)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="新增職務失敗")
    return obj


@router.put("/job-titles/{id}", response_model=schemas.JobTitle)
def update_job_title(id: int, body: schemas.JobTitleUpdate, db: Session = Depends(get_db), current_user=check_permission("menu:admin:jobtitle")):
    """更新職務"""
    obj = db.query(models.JobTitle).filter(models.JobTitle.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="職務不存在")
    if body.name is not None:
        obj.name = body.name.strip()
    if body.sort_order is not None:
        obj.sort_order = body.sort_order
    try:
        db.commit()
        db.refresh(obj)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="更新職務失敗")
    return obj


@router.get("/job-titles/{id}/users")
def get_job_title_users(id: int, db: Session = Depends(get_db), current_user=check_permission("menu:admin:jobtitle")):
    """取得綁定此職務的使用者列表（用於職務管理「查看」）"""
    obj = db.query(models.JobTitle).filter(models.JobTitle.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="職務不存在")
    users = db.query(models.User).options(
        joinedload(models.User.department),
        joinedload(models.User.role),
    ).filter(models.User.job_title_id == id).all()
    return {
        "job_title_id": id,
        "job_title_name": obj.name,
        "users": [
            {
                "emp_id": u.emp_id,
                "name": u.name,
                "department": u.department.name if u.department else None,
                "role": u.role.name if u.role else None,
                "status": u.status,
            }
            for u in users
        ],
    }


@router.delete("/job-titles/{id}")
def delete_job_title(id: int, db: Session = Depends(get_db), current_user=check_permission("menu:admin:jobtitle")):
    """刪除職務（若尚有使用者綁定則不允許刪除）"""
    obj = db.query(models.JobTitle).filter(models.JobTitle.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="職務不存在")
    if obj.users:
        raise HTTPException(status_code=400, detail="尚有使用者綁定此職務，無法刪除")
    db.delete(obj)
    db.commit()
    return {"message": "刪除成功"}


# --- User Management ---
@router.get("/users", response_model=List[schemas.UserDetail])
def get_users(db: Session = Depends(get_db), current_user=check_permission("menu:admin:user")):
    """取得所有使用者"""
    return db.query(models.User).options(
        joinedload(models.User.department),
        joinedload(models.User.role),
        joinedload(models.User.job_title),
    ).all()

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
    if user_update.job_title_id is not None:
        db_user.job_title_id = user_update.job_title_id if user_update.job_title_id else None
    if user_update.status is not None:
        if emp_id.lower() == 'admin' and user_update.status != 'active':
            raise HTTPException(status_code=400, detail="系統預設管理員不能被停用")
        db_user.status = user_update.status

    # 保護 Admin 帳號的角色與單位不被變更
    if emp_id.lower() == 'admin':
        if user_update.role_id is not None and user_update.role_id != db_user.role_id:
            raise HTTPException(status_code=400, detail="系統預設管理員的角色不能變更")
        if user_update.dept_id is not None and user_update.dept_id != db_user.dept_id:
             raise HTTPException(status_code=400, detail="系統預設管理員的部門不能變更")
        
    try:
        db.commit()
        db.refresh(db_user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="更新失敗")
    return db_user

@router.delete("/users/{emp_id}")
def delete_user(emp_id: str, db: Session = Depends(get_db), current_user = check_permission("menu:admin:user")):
    """刪除使用者"""
    db_user = db.query(models.User).filter(models.User.emp_id == emp_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="使用者不存在")
    
    # 保護 admin 帳號不被刪除
    if emp_id.lower() == 'admin':
        raise HTTPException(status_code=400, detail="系統預設管理員不能被刪除")
    
    # 檢查是否有關聯的考試記錄
    exam_records_count = db.query(models.ExamRecord).filter(models.ExamRecord.emp_id == emp_id).count()
    if exam_records_count > 0:
        raise HTTPException(status_code=400, detail=f"該使用者有 {exam_records_count} 筆考試記錄，無法刪除。建議改為停用帳號。")
    
    # 檢查是否有關聯的報到記錄
    attendance_count = db.query(models.AttendanceRecord).filter(models.AttendanceRecord.emp_id == emp_id).count()
    if attendance_count > 0:
        raise HTTPException(status_code=400, detail=f"該使用者有 {attendance_count} 筆報到記錄，無法刪除。建議改為停用帳號。")
    
    try:
        db.delete(db_user)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="刪除失敗")
    
    return {"message": "使用者已刪除"}

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

@router.put("/roles/{role_id}", response_model=schemas.Role)
def update_role(role_id: int, role: schemas.RoleCreate, db: Session = Depends(get_db), current_user = check_permission("menu:admin:role")):
    """更新角色名稱"""
    db_role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="角色不存在")
    
    if db_role.name == "Admin":
        raise HTTPException(status_code=400, detail="系統管理員角色 (Admin) 無法更名")

    db_role.name = role.name
    try:
        db.commit()
        db.refresh(db_role)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="角色名稱可能重複")
    return db_role

@router.delete("/roles/{role_id}")
def delete_role(role_id: int, db: Session = Depends(get_db), current_user = check_permission("menu:admin:role")):
    """刪除角色 (需無成員且無權限)"""
    db_role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not db_role:
        raise HTTPException(status_code=404, detail="角色不存在")
    
    if db_role.name == "Admin":
        raise HTTPException(status_code=400, detail="無法刪除系統管理員角色")
    
    if db_role.users:
        raise HTTPException(status_code=400, detail="該角色尚有成員，無法刪除")
        
    if db_role.functions:
        raise HTTPException(status_code=400, detail="該角色尚有權限設定，請先清空權限")
        
    db.delete(db_role)
    db.commit()
    return {"message": "刪除成功"}

# --- Permission Management ---
@router.get("/functions", response_model=List[schemas.SystemFunction])
def get_functions(db: Session = Depends(get_db), current_user = check_permission("menu:admin")):
    """取得所有系統功能"""
    # 使用 joinedload 預先載入子節點，雖然 Pydantic 會觸發 lazy load，但明確一點比較保險
    # 不過 SQLAlchemy 的 lazy loading 在 async 環境或 session 關閉後可能會失效，
    # 這裡雖然是 sync route，但確保數據載入總是好的。
    # 遞迴載入有點麻煩，通常 Adjacency List 需要設定 loader strategy.
    # 簡單起見，我們讓 Pydantic 觸發 lazy load (預設行為)。
    # 如果使用者回報沒看到子節點，非常有可能是 lazy load 沒觸發或者數據本身沒有 parent_id 關聯?
    # 讓我們試試看 joinedload
    # 需 import joinedload
    from sqlalchemy.orm import joinedload
    
    # 使用 joinedload 確保遞迴載入子節點
    # 注意: joinedload 預設只載入一層。若多層需設定 loader...
    # 但 SystemFunction children 設定了 lazy load，Pydantic dump 時會觸發 lazy load。
    # 如果真的為了保險，可以用 .options(joinedload(models.SystemFunction.children))
    # 但若無限層級，SQLAlchemy 通常建議用 Adjacency List pattern 配合 lazy load。
    # 這裡我們嘗試加上 options 看看是否解決 User 只能看到 Root 的問題。
    # 若 Children 在 DB 有資料，lazy load 應該會抓到。
    # 排列順序依導覽列：考試中心、訓練計畫、報到總覽、考卷工坊、成績中心、系統管理（及其子項）
    NAV_ROOT_ORDER = ["menu:home", "menu:plan", "menu:attendance-overview", "menu:exam", "menu:report", "menu:admin"]
    ADMIN_CHILDREN_NAMES_ORDER = ["單位管理", "分類管理", "人員管理", "職務管理", "角色管理", "權限管理", "功能清單管理", "QRcode 管理"]

    roots = db.query(models.SystemFunction).filter(models.SystemFunction.parent_id == None).options(
        joinedload(models.SystemFunction.children),
    ).all()
    code_to_order = {c: i for i, c in enumerate(NAV_ROOT_ORDER)}
    roots_sorted = sorted(roots, key=lambda f: code_to_order.get(f.code, 999))
    for node in roots_sorted:
        if node.children and node.code == "menu:admin":
            name_to_order = {n: i for i, n in enumerate(ADMIN_CHILDREN_NAMES_ORDER)}
            node.children.sort(key=lambda c: name_to_order.get(c.name, 999))
    return roots_sorted

@router.get("/roles/{role_id}/permissions", response_model=List[int])
def get_role_permissions(role_id: int, db: Session = Depends(get_db), current_user = check_permission("menu:admin:perm")):
    """取得特定角色的功能 ID 列表。角色為 Admin 時永遠回傳全部功能 ID（Admin 永遠擁有全部權限）。"""
    role = db.query(models.Role).filter(models.Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    if role.name == "Admin":
        all_funcs = db.query(models.SystemFunction).all()
        return [f.id for f in all_funcs]
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
    
    # 保護 Admin 角色的權限不被變更
    if role.name == 'Admin':
        raise HTTPException(status_code=400, detail="系統管理者 (Admin) 的權限無法變更")
    
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
