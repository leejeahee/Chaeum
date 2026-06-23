// ════════════════════════════════════════════════════════
//  Chaeum MVP — script.js
//  크루(그룹) 기반 도장깨기 + 다크소울 점령 시스템
// ════════════════════════════════════════════════════════

// ─── App State ───────────────────────────────────────
let points       = 0;
let currentCrewId   = null;
let currentCrewCode = null;
let kakaoMap        = null;

// 유저 고유 색상 (디바이스별 1회 생성 후 localStorage에 저장)
let myUserUUID  = null;
let myUserColor = null;

// 점령 모달 컨텍스트 (현재 열린 장소 정보)
let conquerContext = null;   // { spotId, spotName }

// 장소별 최신 스탬프 상태 캐시 (spotId → { message, user_color, user_uuid })
const stampStateCache = {};

// GPS & 위치 관련 추가 상태
let allSpots            = [];   // 지도에 표시된 전체 스팟 목록 캐시
let currentUserLocation = null; // { lat, lng }
let myLocationMarker    = null; // 내 위치 빨간색 마커 (CustomOverlay)
const CONQUER_LIMIT_METERS = 25; // 점령 제한 거리 (25미터)

// ════════════════════════════════════════════════════════
//  유저 식별자 & 색상 초기화
// ════════════════════════════════════════════════════════
function initUserIdentity() {
  // UUID
  myUserUUID = localStorage.getItem('chaeum_user_uuid');
  if (!myUserUUID) {
    myUserUUID = crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    localStorage.setItem('chaeum_user_uuid', myUserUUID);
  }

  // 색상 — 저장된 것 없으면 HSL로 랜덤 생성
  myUserColor = localStorage.getItem('chaeum_user_color');
  if (!myUserColor) {
    const hue = Math.floor(Math.random() * 360);
    myUserColor = `hsl(${hue}, 70%, 50%)`;
    localStorage.setItem('chaeum_user_color', myUserColor);
  }
}

// ════════════════════════════════════════════════════════
//  유틸리티
// ════════════════════════════════════════════════════════
// 두 좌표 사이의 거리를 계산하는 하버사인(Haversine) 공식
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // 지구 반지름 (미터)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // 미터 반환
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function showEntryError(msg) {
  const el = document.getElementById('entry-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = '';
  setTimeout(() => el.classList.add('hidden'), 3000);
}

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
//  크루 입장 완료 처리
// ════════════════════════════════════════════════════════
async function enterCrew(crewId, inviteCode, crewName) {
  currentCrewId   = crewId;
  currentCrewCode = inviteCode;

  localStorage.setItem('chaeum_crew_id',   crewId);
  localStorage.setItem('chaeum_crew_code', inviteCode);
  localStorage.setItem('chaeum_crew_name', crewName);

  const nameLabel = document.getElementById('crew-name-label');
  if (nameLabel) nameLabel.textContent = crewName || '우리 지도';

  document.getElementById('bottom-nav').classList.remove('hidden');
  setEntryLoading(false);
  switchTab('map');
  initKakaoMap(crewId);
}

// ════════════════════════════════════════════════════════
//  크루 생성
// ════════════════════════════════════════════════════════
async function handleCreateCrew() {
  if (!window._supabaseReady || !window._supabaseClient) {
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
//  점령 모달 열기 / 닫기
// ════════════════════════════════════════════════════════
function openConquerModal(spotId, spotName) {
  // 1. 해당 스팟의 위경도 찾기
  const spot = allSpots.find(s => s.id === spotId);
  if (!spot) {
    showToast('❌ 존재하지 않는 장소입니다.');
    return;
  }

  // 2. 현재 위치 정보가 아직 없는 경우 처리
  if (!currentUserLocation) {
    showToast('📡 현재 위치를 확인하는 중입니다. 다시 시도해 주세요.');
    // 즉시 현재 위치 단발 조회 시도
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentUserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        updateMyLocationMarker(currentUserLocation.lat, currentUserLocation.lng);
      },
      (err) => {
        console.error('[Chaeum] GPS 획득 에러:', err);
        showToast('❌ 위치 권한을 허용해 주셔야 점령할 수 있습니다.');
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
    return;
  }

  // 3. 거리 계산 (미터 단위)
  const distance = getDistance(
    currentUserLocation.lat,
    currentUserLocation.lng,
    spot.lat,
    spot.lng
  );

  // 4. 거리 제한 체크 (25미터)
  if (distance > CONQUER_LIMIT_METERS) {
    showToast(`📍 너무 멉니다! ${CONQUER_LIMIT_METERS}m 이내로 접근해야 합니다. (현재 거리: ${Math.round(distance)}m)`);
    return;
  }

  conquerContext = { spotId, spotName };
  document.getElementById('conquer-place-name').textContent = spotName;
  document.getElementById('conquer-submit-btn').disabled = false;

  // 드롭다운 이벤트 연결 (미리보기 업데이트)
  ['combo-1', 'combo-2', 'combo-3'].forEach(id => {
    const el = document.getElementById(id);
    el.onchange = updateComboPreview;
  });
  updateComboPreview();

  document.getElementById('conquer-modal-backdrop').classList.remove('hidden');
}

function closeConquerModal() {
  document.getElementById('conquer-modal-backdrop').classList.add('hidden');
  conquerContext = null;
}

function updateComboPreview() {
  const v1 = document.getElementById('combo-1').value;
  const v2 = document.getElementById('combo-2').value;
  const v3 = document.getElementById('combo-3').value;
  document.getElementById('combo-preview').textContent = `"${v1} ${v2} ${v3}"`;
}

// ════════════════════════════════════════════════════════
//  점령 제출 → Supabase INSERT → 도장 뒤집기
// ════════════════════════════════════════════════════════
async function submitConquer() {
  if (!conquerContext) return;
  const { spotId, spotName } = conquerContext;

  const v1 = document.getElementById('combo-1').value;
  const v2 = document.getElementById('combo-2').value;
  const v3 = document.getElementById('combo-3').value;
  const message = `${v1} ${v2} ${v3}`;

  const submitBtn = document.getElementById('conquer-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span>점령 중...</span>';

  // Supabase 미설정 → 로컬 데모
  if (!window._supabaseReady || !window._supabaseClient) {
    console.log('[Chaeum] 데모 모드 점령:', { spotId, message });
    _applyConqueredState(spotId, spotName, message, myUserColor, myUserUUID);
    closeConquerModal();
    return;
  }

  const { error } = await window._supabaseClient
    .from('stamps')
    .insert([{
      spot_id:    spotId,
      user_uuid:  myUserUUID,
      user_color: myUserColor,
      message,
    }]);

  if (error) {
    console.error('[Chaeum] 점령 실패:', error);
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>⚔️ 점령하기</span>';
    showToast('❌ 점령에 실패했습니다. 다시 시도해 주세요.');
    return;
  }

  _applyConqueredState(spotId, spotName, message, myUserColor, myUserUUID);
  closeConquerModal();
}

// ════════════════════════════════════════════════════════
//  점령 상태를 도장 UI에 반영 (뒤집기 + 색상 + 캐시 저장)
// ════════════════════════════════════════════════════════
function _applyConqueredState(spotId, spotName, message, userColor, userUuid) {
  // 캐시 갱신
  stampStateCache[spotId] = { message, user_color: userColor, user_uuid: userUuid };

  const card    = document.getElementById(`card-${spotId}`);
  const scene   = document.getElementById(`scene-${spotId}`);
  const wrapper = document.getElementById(`wrapper-${spotId}`);
  const label   = wrapper?.querySelector('.stamp-label');
  const backFace = card?.querySelector('.stamp-face.back');

  if (!card) return;

  // 1. 3D 뒤집기
  card.classList.add('is-flipped');
  scene?.classList.add('flipped');

  // 2. 뒷면 색상 주입 (CSS custom property)
  if (backFace) {
    backFace.classList.add('conquered');
    backFace.style.setProperty('--user-color', userColor);
    backFace.style.background = userColor;
    backFace.style.borderColor = userColor;
  }

  // 3. 래퍼 & 라벨 색상 강조
  if (wrapper) {
    wrapper.classList.add('conquered');
    wrapper.style.setProperty('--user-color', userColor);
  }
  if (label) {
    label.classList.add('conquered');
    label.style.setProperty('--user-color', userColor);
  }

  // 4. 클릭 핸들러 교체 — 이미 점령된 도장은 방명록 팝업 열기
  scene?.setAttribute('onclick', `showStampPopup('${spotId}', '${spotName.replace(/'/g, "\\'")}')`);

  // 5. 포인트 & 토스트
  addPoints(100);
  showToast(`⚔️ ${spotName} 점령 완료! +100 포인트`);
}

// ════════════════════════════════════════════════════════
//  방명록 팝업 (점령된 도장 클릭 시)
// ════════════════════════════════════════════════════════
function showStampPopup(spotId, spotName) {
  const state = stampStateCache[spotId];
  if (!state) return;

  document.getElementById('popup-place-name').textContent = spotName;
  document.getElementById('popup-message-bubble').textContent = `"${state.message}"`;
  document.getElementById('popup-message-bubble').style.borderLeftColor = state.user_color;

  const isMe = state.user_uuid === myUserUUID;
  document.getElementById('popup-occupier-label').textContent =
    isMe ? '🟢 내가 점령 중' : '🔴 다른 탐험가가 점령 중';

  // 재점령 버튼: 재점령 컨텍스트 설정
  document.getElementById('popup-reconquer-btn').onclick = () => {
    closeStampPopup();
    openConquerModal(spotId, spotName);
  };

  document.getElementById('stamp-popup').classList.remove('hidden');
}

function closeStampPopup() {
  document.getElementById('stamp-popup').classList.add('hidden');
}

// (index.html의 onclick="reopenConquerFromPopup()" 용 래퍼 — 현재 팝업에서 재정의하므로 fallback)
function reopenConquerFromPopup() {
  closeStampPopup();
}

// ════════════════════════════════════════════════════════
//  Supabase에서 각 스팟의 최신 stamp 상태 로드
// ════════════════════════════════════════════════════════
async function loadStampStates(spotIds) {
  if (!window._supabaseReady || !window._supabaseClient || !spotIds.length) return;

  // 각 spot_id별로 가장 최근 stamp 1개씩 SELECT
  const { data, error } = await window._supabaseClient
    .from('stamps')
    .select('spot_id, user_uuid, user_color, message, created_at')
    .in('spot_id', spotIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Chaeum] stamp 상태 로드 실패:', error);
    return;
  }

  // spot_id별 가장 최근 1건만 추출 (이미 created_at DESC 정렬됨)
  const seen = new Set();
  (data || []).forEach(row => {
    if (!seen.has(row.spot_id)) {
      seen.add(row.spot_id);
      stampStateCache[row.spot_id] = {
        message:    row.message,
        user_color: row.user_color,
        user_uuid:  row.user_uuid,
      };
    }
  });
}

// ════════════════════════════════════════════════════════
//  Supabase에서 spots 조회
// ════════════════════════════════════════════════════════
async function fetchSpots(crewId) {
  if (!window._supabaseReady || !window._supabaseClient) {
    return [
      { id: 'demo-1', name: '정자 로스터리 카페',     lat: 37.3610, lng: 127.1121, type: 'official', emoji: '☕' },
      { id: 'demo-2', name: '정자 파스타 맛집',        lat: 37.3598, lng: 127.1135, type: 'official', emoji: '🍝' },
      { id: 'demo-3', name: '정자 한강뷰 디저트카페',  lat: 37.3625, lng: 127.1098, type: 'official', emoji: '🍰' },
    ];
  }
  const { data: officialSpots, error: e1 } = await window._supabaseClient
    .from('spots').select('*').eq('type', 'official');
  if (e1) console.error('[Chaeum] official spots 조회 실패:', e1);

  const { data: crewSpots, error: e2 } = await window._supabaseClient
    .from('spots').select('*').eq('crew_id', crewId).eq('type', 'user');
  if (e2) console.error('[Chaeum] crew spots 조회 실패:', e2);

  return [...(officialSpots || []), ...(crewSpots || [])];
}

// ════════════════════════════════════════════════════════
//  CustomOverlay HTML 빌더
// ════════════════════════════════════════════════════════
function buildStampHTML(spot) {
  const isOfficial = spot.type === 'official';
  const emoji = spot.emoji || (isOfficial ? '📍' : '📌');
  const labelClass = isOfficial ? 'stamp-label official' : 'stamp-label';
  const safeName = spot.name.replace(/'/g, "\\'");

  return `
    <div class="stamp-overlay-wrapper" id="wrapper-${spot.id}">
      <div class="stamp-scene" id="scene-${spot.id}"
           onclick="openConquerModal('${spot.id}', '${safeName}')">
        <div class="stamp-card" id="card-${spot.id}">
          <div class="stamp-face front">${emoji}</div>
          <div class="stamp-face back" id="back-${spot.id}">${emoji}</div>
        </div>
        <div class="stamp-badge" id="badge-${spot.id}">✓</div>
      </div>
      <div class="${labelClass}" id="label-${spot.id}">${spot.name}</div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════
//  renderSpotsOnMap — spots 지도에 렌더링 후 stamp 상태 반영
// ════════════════════════════════════════════════════════
function renderSpotsOnMap(spots) {
  if (!kakaoMap || !spots?.length) return;

  spots.forEach(spot => {
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(spot.lat, spot.lng),
      content:  buildStampHTML(spot),
      yAnchor:  1.0,
      zIndex:   spot.type === 'official' ? 4 : 3,
    });
    overlay.setMap(kakaoMap);
  });

  console.log(`[Chaeum] ${spots.length}개 스팟 렌더링 완료`);

  // 스팟 렌더링 직후 — 기존 점령 상태를 로드해 UI에 반영
  const spotIds = spots.map(s => s.id);
  loadStampStates(spotIds).then(() => {
    // 캐시에 있는 점령 상태를 각 도장에 즉시 반영
    spots.forEach(spot => {
      const state = stampStateCache[spot.id];
      if (state) {
        _applyConqueredState(spot.id, spot.name, state.message, state.user_color, state.user_uuid);
      }
    });
  });
}

// ════════════════════════════════════════════════════════
//  Kakao Map 초기화 & GPS 연동
// ════════════════════════════════════════════════════════
function initKakaoMap(crewId) {
  const mapContainer = document.getElementById('kakao-map');
  if (!mapContainer) return;

  if (kakaoMap) {
    fetchAndRender(crewId);
    return;
  }

  const mapOption = {
    center: new kakao.maps.LatLng(37.3610, 127.1121),
    level:  4,
  };
  kakaoMap = new kakao.maps.Map(mapContainer, mapOption);
  kakaoMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  // 내 위치 실시간 추적 시작
  startTrackingUserLocation();

  fetchAndRender(crewId);
}

async function fetchAndRender(crewId) {
  const spots = await fetchSpots(crewId);
  allSpots = spots; // 스팟 좌표 비교를 위해 전역 캐시에 저장
  renderSpotsOnMap(spots);
}

// 기기 GPS 위치 실시간 추적 (watchPosition)
function startTrackingUserLocation() {
  if (!navigator.geolocation) {
    console.error('[Chaeum] Geolocation을 지원하지 않는 브라우저입니다.');
    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      currentUserLocation = { lat, lng };
      
      // 빨간색 마커 생성/업데이트
      updateMyLocationMarker(lat, lng);
    },
    (error) => {
      console.error('[Chaeum] GPS 획득 에러:', error);
      // 권한 거부 등 에러 유형에 따른 디버그 메시지
      if (error.code === error.PERMISSION_DENIED) {
        console.warn('사용자가 위치 정보 제공을 거부했습니다.');
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// 지도 상에 내 위치를 빨간색 마커(CustomOverlay)로 띄우기
function updateMyLocationMarker(lat, lng) {
  if (!kakaoMap) return;

  const latLng = new kakao.maps.LatLng(lat, lng);

  if (!myLocationMarker) {
    // 둥글고 눈에 띄는 빨간색 마커 DOM 생성
    const markerContent = document.createElement('div');
    markerContent.style.cssText = `
      width: 14px;
      height: 14px;
      background-color: #ff3b30;
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
      transform: translate(-50%, -50%);
    `;

    myLocationMarker = new kakao.maps.CustomOverlay({
      position: latLng,
      content: markerContent,
      zIndex: 10
    });
    myLocationMarker.setMap(kakaoMap);
  } else {
    myLocationMarker.setPosition(latLng);
  }
}

// ════════════════════════════════════════════════════════
//  DOMContentLoaded
// ════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // 유저 식별자 초기화
  initUserIdentity();

  // 토스트 엘리먼트 삽입
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  document.querySelector('.phone-container').appendChild(toast);

  // 저장된 크루 → 바로 입장
  const savedCrewId   = localStorage.getItem('chaeum_crew_id');
  const savedCrewCode = localStorage.getItem('chaeum_crew_code');
  const savedCrewName = localStorage.getItem('chaeum_crew_name');

  if (savedCrewId && savedCrewCode) {
    document.getElementById('bottom-nav').classList.remove('hidden');
    const nameLabel = document.getElementById('crew-name-label');
    if (nameLabel) nameLabel.textContent = savedCrewName || '우리 지도';
    currentCrewId   = savedCrewId;
    currentCrewCode = savedCrewCode;
    switchTab('map');

    const tryInit = () => {
      if (typeof kakao !== 'undefined' && kakao.maps)
        kakao.maps.load(() => initKakaoMap(savedCrewId));
    };
    if (typeof kakao !== 'undefined') tryInit();
    else window.addEventListener('load', tryInit);
    return;
  }

  // 첫 진입
  switchTab('entry');
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
