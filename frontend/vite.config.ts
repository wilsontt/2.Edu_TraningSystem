import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const trainingFrontendRoot = path.dirname(fileURLToPath(import.meta.url))
const enterprisePortalRoot = path.resolve(trainingFrontendRoot, '../..')
const sharedUiRoot = path.resolve(enterprisePortalRoot, '0.shared-ui')

// https://vite.dev/config/
export default defineConfig({
  base: '/training/',
  // 注意：
  // 1) import 必須放在檔案頂層，不能誤寫在 defineConfig 物件內（會出現「必須是 ','」語法錯誤）
  // 2) 透過 alias + dedupe 強制 shared-ui 與主專案共用同一份 react/react-dom，
  //    避免 Docker build 後執行期出現 Cannot read properties of null (reading 'useState')
  resolve: {
    alias: {
      '@shared-ui': sharedUiRoot,
      react: path.resolve(trainingFrontendRoot, 'node_modules/react'),
      'react-dom': path.resolve(trainingFrontendRoot, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    fs: {
      allow: [trainingFrontendRoot, enterprisePortalRoot],
    },
    host: '0.0.0.0', // 監聽所有網路介面
    port: 5173,      // 可自訂埠號
    strictPort: false, // 如果埠號被占用，自動嘗試下一個
    proxy: {
      // 本地開發：/training/api 轉發至後端 FastAPI
      '/training/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/training/, ''),
      },
    },
  },
})


