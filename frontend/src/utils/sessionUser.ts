import type { User } from '../types';

const SESSION_USER_KEY = 'training_session_user';

export type SessionUserSnapshot = Pick<User, 'emp_id' | 'name' | 'dept_name' | 'role'>;

/** 登入成功後快取使用者摘要，供報到完成頁在 redirect 後仍能顯示報到人。 */
export function saveSessionUser(user: User): void {
  try {
    const snapshot: SessionUserSnapshot = {
      emp_id: user.emp_id,
      name: user.name,
      dept_name: user.dept_name ?? '',
      role: user.role,
    };
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(snapshot));
  } catch {
    /* private mode / quota */
  }
}

export function loadSessionUser(): SessionUserSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUserSnapshot;
    if (!parsed?.emp_id || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatSessionUserSnapshotLabel(user: SessionUserSnapshot): string {
  const dept = (user.dept_name || '').trim() || (user.role === 'Admin' ? 'IT管理員' : '未知部門');
  return `${dept} · ${user.emp_id} · ${user.name}`;
}
