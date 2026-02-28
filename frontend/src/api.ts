import axios from 'axios';

/** API 基礎路徑，本地由 Vite proxy 轉發，Docker 由 Nginx 轉發 */
export const API_BASE_URL = '/training/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// 請求攔截器：自動加入 JWT Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
