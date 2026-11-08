import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// One config for Vite and Vitest, so tests compile code the same way the app build does.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'API_PROXY_');
  const backend = env.API_PROXY_TARGET || 'http://127.0.0.1:8080';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': backend,
        '/actuator': backend,
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
