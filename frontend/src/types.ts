/**
 * 全域型別定義 (Global Type Definitions)
 * 負責定義前端與後端通訊時使用的資料結構，確保型別安全。
 */

/** 使用者資訊介面 */
export interface User {
  emp_id: string;
  name: string;
  role: string; // 角色名稱字串（含 AD 管理角色，如 "系統管理者"）
  dept_id?: number | null;
  dept_name?: string;
  functions: string[];
}

/** 圖形驗證碼資料 */
export interface CaptchaData {
  captcha_id: string;
  image: string;
}

/** 登入成功的回應結構 */
export interface LoginResponse {
  access_token: string;
  token_type: string;
  auth_src?: 'ad' | 'local' | 'email_fallback';
  user: User;
}

/** break-glass 密碼到期須更換時的回應 */
export interface MustChangePasswordResponse {
  must_change_password: true;
  change_token: string;
}

/** Email OTP 請求成功回應 */
export interface EmailOtpRequestResponse {
  detail: string;
}

/** 部門/單位介面 */
export interface Department {
  id: number;
  name: string;
  user_count?: number;
}
