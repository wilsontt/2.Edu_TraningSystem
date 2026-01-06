import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0', // 監聽所有網路介面
    port: 5173,      // 可自訂埠號
    strictPort: false, // 如果埠號被占用，自動嘗試下一個
  },
})


