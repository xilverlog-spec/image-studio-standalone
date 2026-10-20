import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// 화면 맨 위 표제란에 보여 줄 실제 값: 버전(package.json), 갱신일(이 빌드를 만든 날짜)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const d = new Date();
const buildDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  server: {
    port: 5181,
    // 같은 네트워크의 다른 PC에서 접속 테스트할 수 있도록 모든 인터페이스에 바인딩.
    host: true,
    // 프로젝트 폴더의 사진·자료 폴더를 감시하다 잠긴 파일(EBUSY)에서 개발 서버가 죽는 일이 있어, 소스가 아닌 폴더는 감시에서 뺀다
    watch: { ignored: ['**/모델링/**', '**/이미지/**', '**/스튜디오/**', '**/화면/**', '**/참고자료/**', '**/참고삽도/**', '**/SANGJI/**', '**/output/**', '**/data/**', '**/logs/**', '**/backend/**', '**/dist/**', '**/사내 디자인.md (수정중)/**', '**/docs/**', '**/third_party/**'] },
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
      },
      '/drawio': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
