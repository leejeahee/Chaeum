// ════════════════════════════════════════════════════════
//  Chaeum MVP — script.js
//  크루(그룹) 기반 도장깨기 지도
// ════════════════════════════════════════════════════════

// ─── App State ───────────────────────────────────────
let points = 0;
let currentCrewId   = null;   // 현재 입장한 크루 UUID
let currentCrewCode = null;   // 현재 크루 초대 코드
let kakaoMap        = null;   // Kakao Map 인스턴스
// 장소별 뒤집힘 상태 (spot id → boolean)
const flippedSpots = {};

// ─── Supabase 클라이언트 (supabase_init.js에서 노출됨) ──
// supabase_init.js의 _supabaseReady / supabase 전역 변수 사용

// ════════════════════════════════════════════════════════
//  유틸리티
// ════════════════════════════════════════════════════════

/** 6자리 영숫자 랜덤 코드 생성 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자 제거
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** 토스트 메시지 표시 */
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

/** 에러 메시지 표시 */
function showEntryError(msg) {
  const el = document.getElementById('entry-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  // 애니메이션 재시작
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = '';
  setTimeout(() => el.classList.add('hidden'), 3000);
}

/** 로딩 표시/숨김 */
function setEntryLoading(visible) {
  const el = document.getElementById('entry-loading');
  const btns = document.querySelectorAll('.entry-btn');
  if (visible) {
    el.classList.remove('hidden');
    btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
  } else {
    el.classList.add('hidden');
    btns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
  }
}

/** 포인트 UI 업데이트 */
function addPoints(amount) {
  points += amount;
  const el = document.getElementById('user-points');
  if (el) el.textContent = points.toLocaleString();
}

// ════════════════════════════════════════════════════════
//  탭 전환
// ════════════════════════════════════════════════════════
function switchTab(tabId) {
  document.querySelectorAll('.screen-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  const target = document.getElementById(`screen-${tabId}`);
  if (target) target.classList.remove('hidden');

  const navItem = document.getElementById(`nav-${tabId}`);
  if (navItem) navItem.classList.add('active');
}

// ════════════════════════════════════════════════════════
//  크루 입장 완료 처리 — 지도 화면으로 전환
// ════════════════════════════════════════════════════════
async function enterCrew(crewId, inviteCode, crewName) {
  currentCrewId   = crewId;
  currentCrewCode = inviteCode;

  // localStorage에 크루 정보 저장 (재진입 지원)
  localStorage.setItem('chaeum_crew_id',   crewId);
  localStorage.setItem('chaeum_crew_code', inviteCode);
  localStorage.setItem('chaeum_crew_name', crewName);

  // 지도 타이틀 업데이트
  const nameLabel = document.getElementById('crew-name-label');
  if (nameLabel) nameLabel.textContent = crewName || '우리 지도';

  // GNB 표시
  document.getElementById('bottom-nav').classList.remove('hidden');

  // 진입 화면 → 지도 화면 전환
  setEntryLoading(false);
  switchTab('map');

  // Kakao 지도 초기화 (아직 안 됐으면)
  initKakaoMap(crewId);
}

// ════════════════════════════════════════════════════════
//  크루 생성 (새 지도 만들기)
// ════════════════════════════════════════════════════════
async function handleCreateCrew() {
  // Supabase 미설정 시 오프라인 데모 모드 진입
  if (!window._supabaseReady || !window._supabaseClient) {
    console.warn('[Chaeum] Supabase 미설정 → 데모 모드로 진입');
    enterCrew('demo-crew-id', 'DEMO01', '데모 지도');
    return;
  }

  setEntryLoading(true);
  document.getElementById('entry-error').classList.add('hidden');

  const inviteCode = generateInviteCode();

  const { data, error } = await window._supabaseClient
    .from('crews')
    .insert([{ name: '우리 지도', invite_code: inviteCode }])
    .select()
    .single();

  if (error) {
    console.error('[Chaeum] 크루 생성 실패:', error);
    setEntryLoading(false);
    showEntryError('지도 생성에 실패했습니다. 다시 시도해 주세요.');
    return;
  }

  await enterCrew(data.id, data.invite_code, data.name);
}

// ════════════════════════════════════════════════════════
//  초대 코드로 크루 입장
// ════════════════════════════════════════════════════════
async function handleJoinCrew() {
  const inputEl = document.getElementById('invite-code-input');
  const code = inputEl.value.trim().toUpperCase();

  if (code.length !== 6) {
    showEntryError('초대 코드는 6자리입니다.');
    inputEl.focus();
    return;
  }

  // Supabase 미설정 시 데모 모드
  if (!window._supabaseReady || !window._supabaseClient) {
    enterCrew('demo-crew-id', code, '데모 지도');
    return;
  }

  setEntryLoading(true);
  document.getElementById('entry-error').classList.add('hidden');

  const { data, error } = await window._supabaseClient
    .from('crews')
    .select('*')
    .eq('invite_code', code)
    .single();

  if (error || !data) {
    setEntryLoading(false);
    showEntryError('유효하지 않은 초대 코드입니다.');
    return;
  }

  await enterCrew(data.id, data.invite_code, data.name);
}

// ════════════════════════════════════════════════════════
//  크루 코드 공유 모달
// ════════════════════════════════════════════════════════
function showCrewCode() {
  document.getElementById('crew-code-display').textContent = currentCrewCode || '------';
  document.getElementById('crew-modal-backdrop').classList.remove('hidden');
}

function closeCrewModal() {
  document.getElementById('crew-modal-backdrop').classList.add('hidden');
}

function copyCrewCode() {
  if (!currentCrewCode) return;
  navigator.clipboard.writeText(currentCrewCode)
    .then(() => showToast('📋 코드가 복사되었습니다!'))
    .catch(() => showToast(`코드: ${currentCrewCode}`));
}

// ════════════════════════════════════════════════════════
//  Supabase에서 spots 조회
//  — official 전체 + 현재 crew_id에 속한 user 핀
// ════════════════════════════════════════════════════════
async function fetchSpots(crewId) {
  // Supabase 미설정 → 하드코딩 데모 데이터 반환
  if (!window._supabaseReady || !window._supabaseClient) {
    return [
      { id: 'demo-1', name: '정자 로스터리 카페',     lat: 37.3610, lng: 127.1121, type: 'official', emoji: '☕' },
      { id: 'demo-2', name: '정자 파스타 맛집',        lat: 37.3598, lng: 127.1135, type: 'official', emoji: '🍝' },
      { id: 'demo-3', name: '정자 한강뷰 디저트카페',  lat: 37.3625, lng: 127.1098, type: 'official', emoji: '🍰' },
    ];
  }

  // official 핀 (crew_id is null)
  const { data: officialSpots, error: e1 } = await window._supabaseClient
    .from('spots')
    .select('*')
    .eq('type', 'official');

  if (e1) console.error('[Chaeum] official spots 조회 실패:', e1);

  // 크루 전용 핀
  const { data: crewSpots, error: e2 } = await window._supabaseClient
    .from('spots')
    .select('*')
    .eq('crew_id', crewId)
    .eq('type', 'user');

  if (e2) console.error('[Chaeum] crew spots 조회 실패:', e2);

  return [...(officialSpots || []), ...(crewSpots || [])];
}

// ════════════════════════════════════════════════════════
//  지도 위 CustomOverlay HTML 빌더
// ════════════════════════════════════════════════════════
function buildStampHTML(spot) {
  const isOfficial = spot.type === 'official';
  const emoji = spot.emoji || (isOfficial ? '📍' : '📌');
  const labelClass = isOfficial ? 'stamp-label official' : 'stamp-label';

  return `
    <div class="stamp-overlay-wrapper" id="wrapper-${spot.id}">
      <div class="stamp-scene" id="scene-${spot.id}" onclick="flipStamp('${spot.id}', '${spot.name.replace(/'/g, "\\'")}')">
        <div class="stamp-card" id="card-${spot.id}">
          <div class="stamp-face front">${emoji}</div>
          <div class="stamp-face back">${emoji}</div>
        </div>
        <div class="stamp-badge" id="badge-${spot.id}">✓</div>
      </div>
      <div class="${labelClass}">${spot.name}</div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════
//  도장 클릭 → 뒤집기 (테스트용 마우스 클릭 인증)
// ════════════════════════════════════════════════════════
function flipStamp(spotId, spotName) {
  const card  = document.getElementById(`card-${spotId}`);
  const scene = document.getElementById(`scene-${spotId}`);
  if (!card) return;

  flippedSpots[spotId] = !flippedSpots[spotId];

  if (flippedSpots[spotId]) {
    card.classList.add('is-flipped');
    scene.classList.add('flipped');
    addPoints(50);
    showToast(`🎉 ${spotName} 도장 획득! +50 포인트`);
  } else {
    card.classList.remove('is-flipped');
    scene.classList.remove('flipped');
  }
}

// ════════════════════════════════════════════════════════
//  renderSpotsOnMap(spots) — 지도 위에 스팟을 CustomOverlay로 렌더링
// ════════════════════════════════════════════════════════
function renderSpotsOnMap(spots) {
  if (!kakaoMap) {
    console.error('[Chaeum] renderSpotsOnMap: 지도가 아직 초기화되지 않음');
    return;
  }
  if (!spots || spots.length === 0) {
    showToast('표시할 장소가 없습니다.');
    return;
  }

  spots.forEach(spot => {
    const position = new kakao.maps.LatLng(spot.lat, spot.lng);

    const overlay = new kakao.maps.CustomOverlay({
      position,
      content: buildStampHTML(spot),
      yAnchor: 1.0,
      zIndex: spot.type === 'official' ? 4 : 3,
    });

    overlay.setMap(kakaoMap);
  });

  console.log(`[Chaeum] ${spots.length}개 스팟 렌더링 완료`);
}

// ════════════════════════════════════════════════════════
//  Kakao Map 초기화
// ════════════════════════════════════════════════════════
function initKakaoMap(crewId) {
  const mapContainer = document.getElementById('kakao-map');
  if (!mapContainer) return;

  // 이미 초기화된 경우 재사용 (지도 인스턴스 유지)
  if (kakaoMap) {
    fetchAndRender(crewId);
    return;
  }

  const mapOption = {
    center: new kakao.maps.LatLng(37.3610, 127.1121), // 정자역 중심
    level: 4,
  };

  kakaoMap = new kakao.maps.Map(mapContainer, mapOption);

  const zoomControl = new kakao.maps.ZoomControl();
  kakaoMap.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

  // 지도 생성 후 spots 조회 및 렌더링
  fetchAndRender(crewId);
}

/** spots 조회 후 지도에 렌더링 */
async function fetchAndRender(crewId) {
  const spots = await fetchSpots(crewId);
  renderSpotsOnMap(spots);
}

// ════════════════════════════════════════════════════════
//  DOMContentLoaded
// ════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // 토스트 엘리먼트 삽입
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  document.querySelector('.phone-container').appendChild(toast);

  // localStorage에 저장된 크루 있으면 바로 입장
  const savedCrewId   = localStorage.getItem('chaeum_crew_id');
  const savedCrewCode = localStorage.getItem('chaeum_crew_code');
  const savedCrewName = localStorage.getItem('chaeum_crew_name');

  if (savedCrewId && savedCrewCode) {
    // 재진입: Supabase에서 크루 유효성 검사 없이 바로 진입 (MVP 단계)
    document.getElementById('bottom-nav').classList.remove('hidden');
    const nameLabel = document.getElementById('crew-name-label');
    if (nameLabel) nameLabel.textContent = savedCrewName || '우리 지도';
    currentCrewId   = savedCrewId;
    currentCrewCode = savedCrewCode;
    switchTab('map');

    // Kakao SDK 준비 후 지도 초기화
    const tryInit = () => {
      if (typeof kakao !== 'undefined' && kakao.maps) {
        kakao.maps.load(() => initKakaoMap(savedCrewId));
      }
    };
    if (typeof kakao !== 'undefined') tryInit();
    else window.addEventListener('load', tryInit);
    return;
  }

  // 첫 진입: 진입 화면 표시
  switchTab('entry');

  // Kakao SDK 준비 (지도는 크루 입장 후에 초기화)
  // → 미리 SDK를 로드해 두기만 함
});

// ════════════════════════════════════════════════════════
//  Supabase DB 포인트 동기화 (supabase_init.js 콜백)
// ════════════════════════════════════════════════════════
function applyDBPoints(userData) {
  if (!userData) return;
  points = userData.points || 0;
  const el = document.getElementById('user-points');
  if (el) el.textContent = points.toLocaleString();
}
