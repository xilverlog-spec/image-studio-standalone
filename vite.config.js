import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    // 같은 네트워크의 다른 PC에서 접속 테스트할 수 있도록 모든 인터페이스에 바인딩.
    host: true,
    // cloudflared 같은 터널을 통해 매번 바뀌는 임의의 외부 도메인으로 접속하므로
    // Vite의 host-check를 꺼둔다 (테스트 목적의 임시 서버라 허용 범위를 넓게 잡음).
    allowedHosts: true,
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
