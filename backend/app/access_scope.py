from typing import Iterable, List, Literal, Optional, Sequence, Set

from sqlalchemy.orm import Session

from . import models

DataScope = Literal["all", "department", "self"]

# 角色優先：全域可見
GLOBAL_ACCESS_ROLES = {
    "Admin",
    "ADMIN",
    "System Admin",
    "系統管理",
    "系統管理者",
}

# 角色優先：部門可見（可依實際角色命名持續補齊）
DEPARTMENT_SCOPE_ROLE_KEYWORDS = (
    "manager",
    "主管",
    "副理",
    "經理",
    "主任",
    "課長",
    "組長",
)

# 職務補充：全域可見
GLOBAL_ACCESS_JOB_TITLES = {
    "總稽核",
}

# 職務補充：部門可見
DEPARTMENT_SCOPE_JOB_TITLES = {
    "主管",
    "副理",
    "經理",
    "主任",
    "課長",
    "組長",
    "稽核",
}


def resolve_data_scope(current_user: models.User, db: Optional[Session] = None) -> DataScope:
    """
    Hybrid 規則：
    1) 角色優先
    2) 職務補充
    3) 預設 self（最小權限）
    """
    role_name = (current_user.role.name if current_user and current_user.role else "").strip()

    # 角色部門權限（可配置）優先
    if db is not None and current_user and current_user.role_id:
        scope_row = db.query(models.RoleDepartmentScope).filter(
            models.RoleDepartmentScope.role_id == current_user.role_id
        ).first()
        if scope_row and scope_row.scope_type in ("all", "department", "self"):
            return scope_row.scope_type

    if role_name in GLOBAL_ACCESS_ROLES:
        return "all"
    role_lower = role_name.lower()
    if role_name and any(keyword in role_lower for keyword in DEPARTMENT_SCOPE_ROLE_KEYWORDS):
        return "department"

    job_title_name = (current_user.job_title.name if current_user and current_user.job_title else "").strip()
    if job_title_name in GLOBAL_ACCESS_JOB_TITLES:
        return "all"
    if job_title_name in DEPARTMENT_SCOPE_JOB_TITLES:
        return "department"

    return "self"


def is_active_user_status(status: Optional[str]) -> bool:
    """帳號是否為在職（active）。"""
    return (status or "").strip().lower() == "active"


def apply_active_user_filter(query):
    """SQLAlchemy User 查詢：僅在職帳號。"""
    return query.filter(models.User.status == "active")


def get_scope_emp_ids(db: Session, current_user: models.User, active_only: bool = False) -> Optional[List[str]]:
    """
    回傳可見 emp_id 範圍：
    - None: all
    - []: 無可見資料
    - [emp_id...]: 可見名單
    """
    scope = resolve_data_scope(current_user, db=db)
    role_scope_row = None
    selected_dept_ids: Set[int] = set()
    if current_user and current_user.role_id:
        role_scope_row = db.query(models.RoleDepartmentScope).filter(
            models.RoleDepartmentScope.role_id == current_user.role_id
        ).first()
        if role_scope_row and role_scope_row.scope_type == "department":
            selected_dept_ids = {
                row[0]
                for row in db.query(models.RoleDepartmentScopeDept.dept_id).filter(
                    models.RoleDepartmentScopeDept.role_id == current_user.role_id
                ).all()
            }

    if scope == "all":
        if active_only:
            return [row[0] for row in apply_active_user_filter(db.query(models.User.emp_id)).all()]
        return None

    if scope == "department":
        # 規則：
        # 1) 登入者自己部門一定可見
        # 2) 若角色部門權限有設定額外部門，則做聯集
        # 3) 若該角色未設定 department row，維持舊行為（只看自己部門）
        allowed_dept_ids: Set[int] = set()
        if current_user.dept_id is not None:
            allowed_dept_ids.add(current_user.dept_id)

        if role_scope_row and role_scope_row.scope_type == "department":
            allowed_dept_ids.update(selected_dept_ids)

        if not allowed_dept_ids:
            return []

        query = db.query(models.User.emp_id).filter(models.User.dept_id.in_(allowed_dept_ids))
        if active_only:
            query = query.filter(models.User.status == "active")
        return [row[0] for row in query.all()]

    # self
    if active_only and current_user.status != "active":
        return []
    return [current_user.emp_id]


def apply_emp_scope(query, emp_field, allowed_emp_ids: Optional[Sequence[str]]):
    """將 emp_id 範圍套用到 query。"""
    if allowed_emp_ids is None:
        return query
    if not allowed_emp_ids:
        return query.filter(False)
    return query.filter(emp_field.in_(allowed_emp_ids))


def intersect_emp_ids(candidate_emp_ids: Iterable[str], allowed_emp_ids: Optional[Sequence[str]]) -> Set[str]:
    """
    把候選 emp_id 與 scope 交集化：
    - allowed=None => 不限制
    """
    candidate_set = set(candidate_emp_ids)
    if allowed_emp_ids is None:
        return candidate_set
    return candidate_set.intersection(set(allowed_emp_ids))
