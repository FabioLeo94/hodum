/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    // Senza questo, vitest scansiona l'intero repo (incluso backend/, che ha
    // il proprio vitest.config.mts e setupTests.ts con variabili d'ambiente
    // diverse): i test del backend finirebbero eseguiti anche qui, senza le
    // env fittizie che si aspettano, e fallirebbero.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
