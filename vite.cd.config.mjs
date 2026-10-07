import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: './', publicDir: false, build: { outDir: 'public/cd_test', emptyOutDir: true, rollupOptions: { input: 'cd_test.html' }, minify: false } });
