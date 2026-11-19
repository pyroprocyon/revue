import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

// Measured November 17, 2026: these libraries are 109.6 KB of the 151.8 KB gzipped script. In their own
// chunk, a returning learner's browser keeps them cached across a deploy that changes only app code.
const RARELY_CHANGING_LIBRARIES = /node_modules[\\/](react|react-dom|react-router|scheduler|@tanstack)[\\/]/;

// One config for Vite and Vitest, so tests compile code the same way the app build does.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'API_PROXY_');
  const backend = env.API_PROXY_TARGET || 'http://127.0.0.1:8080';
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        output: { codeSplitting: { groups: [{ name: 'vendor', test: RARELY_CHANGING_LIBRARIES }] } },
      },
    },
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
      exclude: [...configDefaults.exclude, 'e2e/**'],
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
