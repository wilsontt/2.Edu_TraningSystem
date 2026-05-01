/**
 * 全域型別定義 (Global Type Definitions)
 * 負責定義前端與後端通訊時使用的資料結構，確保型別安全。
 */

/** 使用者資訊介面 */
export interface User {
  emp_id: string; // 員工編號
  name: string; // 姓名
  role: 'Admin' | 'User'; // 系統角色
  dept_name?: string; // 部門名稱 (可選)
  functions: string[]; // 權限功能清單 (如 menu:exam, btn:export)
}

/** 圖形驗證碼資料 */
export interface CaptchaData {
  captcha_id: string; // 驗證碼唯一識別 ID
  image: string; // Base64 編碼的驗證碼圖片
}

/** 登入成功的回應結構 */
export interface LoginResponse {
  access_token: string; // JWT 存取權杖
  token_type: string; // Token 類型 (通常為 Bearer)
  user: User; // 使用者詳細資料
}

/** 部門/單位介面 */
export interface Department {
  id: number;
  name: string;
  user_count?: number; // 該部門的使用者總數
}
