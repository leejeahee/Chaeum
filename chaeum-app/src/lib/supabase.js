import { createClient } from '@supabase/supabase-js';

// import.meta.env — Vite가 빌드 시 .env 파일의 값을 주입합니다.
// 하드코딩된 키는 이 파일에 절대 작성하지 마세요.
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON;

if (!supabaseUrl || !supabaseAnon) {
  console.error('[Chaeum] .env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON이 설정되지 않았습니다.');
}

export const supabase = (supabaseUrl && supabaseAnon)
  ? createClient(supabaseUrl, supabaseAnon)
  : null;
