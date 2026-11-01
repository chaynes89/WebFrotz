import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: process.env.WEBFROTZ_BASE || '/',
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts'] },
})
