import type { User } from '../types';

/** 與後端 SUPER_ADMIN_ROLE_NAMES 一致；權限／角色名稱不可透過 UI 變更 */
export const PROTECTED_ROLE_NAMES = new Set([
  'Admin',
  'System Admin',
  '系統管理',
  '系統管理者',
]);

export function isProtectedSystemRole(roleName: string): boolean {
  return PROTECTED_ROLE_NAMES.has(roleName);
}

export function hasFunction(user: User, code: string): boolean {
  return (user.functions || []).includes(code);
}

/**
 * 判斷使用者是否具備管理後台存取權。
 * - 向下相容：role === 'Admin' 的 break-glass 帳號維持完整存取
 * - AD 管理帳號：依 functions 陣列判斷（含 menu:admin 或其子碼）
 */
export function hasAdminMenu(user: User): boolean {
  if (user.role === 'Admin') return true;
  return (user.functions || []).some(
    (f) => f === 'menu:admin' || f.startsWith('menu:admin:')
  );
}

/**
 * Owner（開課單位）刪除權限判斷，與後端 access_scope.can_delete_owned_resource 一致：
 * - resourceDeptId 為 null/undefined：既有資料未設定 owner，不受限制
 * - 超管／系統管理角色：一律放行
 * - 否則僅開課單位（user.dept_id 與 resourceDeptId 相同）可刪除
 */
export function canDeleteOwnedResource(user: User, resourceDeptId: number | null | undefined): boolean {
  if (resourceDeptId == null) return true;
  if (isProtectedSystemRole(user.role)) return true;
  return user.dept_id === resourceDeptId;
}
