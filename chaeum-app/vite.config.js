import { defineConfig } from 'vite';

// ngrok 등 외부 터널로 접속할 때 Vite의 host 차단(DNS rebinding 방지)을 우회하기 위한 설정.
// 로컬 개발/테스트 전용 설정이므로 프로덕션 빌드에는 영향 없음.
export default defineConfig({
  server: {
    allowedHosts: true,
  },
});
