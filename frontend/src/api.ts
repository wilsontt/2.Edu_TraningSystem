import axios from 'axios';

const api = axios.create({
  // 自動判斷後端位置：如果是 localhost 就用 localhost，如果是 IP 就用 IP
  baseURL: `http://${window.location.hostname}:8000/api`,
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
