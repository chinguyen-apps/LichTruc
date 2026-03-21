import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // THAY ĐỔI: Tên repository của bạn (ví dụ: /lich-truc-bidv/)
  base: '/LichTruc', 
})
