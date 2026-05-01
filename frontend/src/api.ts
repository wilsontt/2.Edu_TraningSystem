/**
 * Axios API 通訊配置 (Axios API Client Configuration)
 * 負責統一配置後端請求的基礎路徑、攔截器 (Interceptors) 以及身份驗證 (JWT)。
 */

import axios from 'axios';

/** 
 * API 基礎路徑配置
 * - 開發環境：由 Vite Proxy (vite.config.ts) 轉發至 http://localhost:8000
 * - 生產環境：由 Nginx 反向代理轉發
 */
export const API_BASE_URL = '/training/api';

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
 * 回應攔截器 (Response Interceptor) - 可選擴充
 * 可在此處處理 401 (Token 過期) 自動導回登入頁的邏輯
 */
// api.interceptors.response.use(...)

export default api;
