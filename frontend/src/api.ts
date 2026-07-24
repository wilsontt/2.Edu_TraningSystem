/**
 * Axios API 通訊配置 (Axios API Client Configuration)
 * 負責統一配置後端請求的基礎路徑、攔截器 (Interceptors) 以及身份驗證 (JWT)。
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

/** 
 * API 基礎路徑配置
 * - 開發環境：由 Vite Proxy (vite.config.ts) 轉發至 http://localhost:8000
 * - 生產環境：由 Nginx 反向代理轉發
 */
export const API_BASE_URL = '/training/api';

/** 登入／註冊等公開端點：401 不觸發自動踢出（避免登入失敗也被導走）。 */
function isPublicAuthRequest(config?: InternalAxiosRequestConfig): boolean {
  const url = config?.url ?? '';
  // baseURL 已含 /training/api；url 多為相對路徑如 /auth/login
  if (url.includes('/auth/me')) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/captcha') ||
    url.includes('/auth/password')
  );
}

let handlingUnauthorized = false;

/** 清除 token 並導向登入頁；通知 App 清 user state。 */
export function handleUnauthorizedSession(): void {
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  try {
    localStorage.removeItem('token');
    window.dispatchEvent(new CustomEvent('auth:session-expired'));
    const base = import.meta.env.BASE_URL || '/training/';
    const loginPath = `${base.endsWith('/') ? base : `${base}/`}login`;
    const onLoginPage = window.location.pathname.includes('/login');
    if (!onLoginPage) {
      window.location.assign(loginPath);
    }
  } finally {
    // 允許之後再次觸發（例如重新登入後又過期）
    window.setTimeout(() => {
      handlingUnauthorized = false;
    }, 1000);
  }
}

// 建立 Axios 實例，設定基礎 URL
const api = axios.create({
  baseURL: API_BASE_URL,
});

/**
 * 請求攔截器 (Request Interceptor)
 * 在每一個對外發出的 HTTP 請求 Header 中，自動注入儲存於 localStorage 的 JWT Token。
 * 確保受保護的端點 (Protected Routes) 能夠順利通過後端的身份驗證。
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    // 格式為 Authorization: Bearer <token>
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * 回應攔截器：受保護 API 回 401 時自動踢回登入頁。
 */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !isPublicAuthRequest(error.config)) {
      handleUnauthorizedSession();
    }
    return Promise.reject(error);
  },
);

export default api;
