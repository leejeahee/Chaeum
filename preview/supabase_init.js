// =======================================================
// supabase_init.js
// 역할: Supabase 클라이언트 초기화 + 앱 진입 시 유저 동기화
// 실행 순서: script.js 보다 반드시 먼저 로드됨 (index.html에서 순서 보장)
// =======================================================

// ── 1. Supabase 클라이언트 초기화 ──────────────────────
//  ⚠️ 아래 두 값을 Supabase 프로젝트의 실제 값으로 교체하세요.
//  Settings > API > Project URL / anon public key
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';

// Supabase 설정 전 가드 — 플레이스홀더 상태면 클라이언트 초기화 건너뜀
const _supabaseReady = SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON !== 'YOUR_SUPABASE_ANON_KEY';
const supabase = _supabaseReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

// ── 2. UUID 생성 헬퍼 (crypto.randomUUID 미지원 브라우저 대비 폴백) ──
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 폴백: RFC-4122 v4 형식의 UUID를 직접 생성
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── 3. 앱 진입 시 유저 동기화 메인 함수 ─────────────────
async function initUser() {
  if (!supabase) return; // Supabase 미설정 시 건너뜀
  const STORAGE_KEY = 'device_uuid';
  let deviceUUID = localStorage.getItem(STORAGE_KEY);

  if (!deviceUUID) {
    // ── 3-A. 최초 진입: 새 UUID 생성 → DB INSERT → localStorage 저장
    console.log('[Chamap] 최초 진입 감지 → 새 유저 생성 중...');
    deviceUUID = generateUUID();

    const { data, error } = await supabase
      .from('users')
      .insert([{ id: deviceUUID }])
      .select()
      .single();

    if (error) {
      console.error('[Chamap] 유저 생성 실패:', error.message);
      return;
    }

    localStorage.setItem(STORAGE_KEY, deviceUUID);
    console.log('[Chamap] 새 유저 생성 완료:', data);

    // script.js의 앱 상태를 DB 값으로 초기화
    _applyUserState(data);

  } else {
    // ── 3-B. 재진입: DB에서 해당 UUID의 유저 정보 SELECT
    console.log('[Chamap] 기존 유저 감지 (UUID:', deviceUUID, ') → DB에서 상태 로드 중...');

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', deviceUUID)
      .single();

    if (error) {
      console.error('[Chamap] 유저 정보 로드 실패:', error.message);
      // DB에 해당 UUID가 없을 경우 (예: DB 초기화 후) localStorage도 초기화
      if (error.code === 'PGRST116') {
        console.warn('[Chamap] DB에 해당 UUID 없음 → localStorage 초기화 후 재시도');
        localStorage.removeItem(STORAGE_KEY);
        await initUser(); // 재귀 호출로 신규 유저 등록 흐름 진입
      }
      return;
    }

    console.log('[Chamap] 유저 정보 로드 완료:', data);

    // script.js의 앱 상태를 DB 값으로 덮어씀
    _applyUserState(data);
  }
}

// ── 4. DB 데이터를 script.js 앱 상태에 반영 ─────────────
// initUser()는 비동기이므로, script.js의 loadState()보다 늦게 끝날 수 있음.
// _applyDBStateToUI()가 이미 정의되어 있으면 직접 호출, 아니면 pending에 담아둠.
function _applyUserState(userData) {
  if (typeof applyDBPoints === 'function') {
    // script.js가 이미 로드된 경우 → 즉시 UI에 포인트 반영
    applyDBPoints(userData);
  } else {
    // script.js가 아직 로드되지 않은 경우 → pending에 담아둠
    window._pendingUserState = userData;
  }
}

// ── 5. 진입점: DOM 준비 완료 후 실행 ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Supabase 미설정 시 initUser 건너뜀
  if (_supabaseReady) {
    initUser();
  } else {
    console.log('[Chaeum] Supabase 미설정 — 오프라인 모드로 실행');
  }
});
