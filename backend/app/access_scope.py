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


def resolve_data_scope(current_user: models.User) -> DataScope:
    """
    Hybrid 規則：
    1) 角色優先
    2) 職務補充
    3) 預設 self（最小權限）
    """
    role_name = (current_user.role.name if current_user and current_user.role else "").strip()
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


def get_scope_emp_ids(db: Session, current_user: models.User, active_only: bool = False) -> Optional[List[str]]:
    """
    回傳可見 emp_id 範圍：
    - None: all
    - []: 無可見資料
    - [emp_id...]: 可見名單
    """
    scope = resolve_data_scope(current_user)
    if scope == "all":
        return None

    if scope == "department":
        if current_user.dept_id is None:
            return []
        query = db.query(models.User.emp_id).filter(models.User.dept_id == current_user.dept_id)
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
