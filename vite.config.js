import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    proxy: {
      '/v1': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/generated': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
