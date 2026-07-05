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
