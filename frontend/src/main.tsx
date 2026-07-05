/**
 * 前端應用程式進入點 (Frontend Entry Point)
 * 負責將 React 根元件掛載至實體 DOM 節點，並啟用嚴格模式 (StrictMode)。
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css' // 全域樣式配置 (包含 Tailwind CSS)
import App from './App.tsx' // 主應用元件

// 取得 HTML 中的 root 節點並渲染
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
