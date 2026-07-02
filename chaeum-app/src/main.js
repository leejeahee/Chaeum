// ════════════════════════════════════════════════════════
//  Chaeum MVP — main.js (Vite ES Module)
//  크루(그룹) 기반 도장깨기 + 다크소울 점령 시스템
// ════════════════════════════════════════════════════════

import './style.css';
import { supabase } from './lib/supabase.js';

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

// 장소 좌표 캐시 (spotId → { lat, lng }) — 재점령 GPS 체크용
const spotsDataCache = {};

// ─── GPS 상태 ─────────────────────────────────────────
let userLat           = null;  // 유저 현재 위도
let userLng           = null;  // 유저 현재 경도
let gpsWatchId        = null;  // watchPosition 핸들 (cleanup용)
let myLocationOverlay = null;  // 블루 돗 CustomOverlay
let gpsState          = 'pending'; // 'pending' | 'ok' | 'denied' | 'error'

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
//  GPS 유틸리티
// ════════════════════════════════════════════════════════

/**
 * Haversine Formula — 두 위경도 좌표 간 직선 거리(m) 계산
 */
function calcDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 지구 반경 (m)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 실시간 GPS 감시 시작
 * - 크루 입장 후 initKakaoMap과 함께 호출
 * - Capacitor 전환 시 이 함수만 교체하면 됨
 */
function startGPSWatch() {
  if (!navigator.geolocation) {
    console.warn('[Chaeum GPS] Geolocation API 미지원 기기');
    return;
  }
  if (gpsWatchId !== null) return; // 이미 감시 중

  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      console.log(`[Chaeum GPS] 위치 업데이트: ${userLat.toFixed(5)}, ${userLng.toFixed(5)}`);

      // GPS 최초 수신 시 상태 전이 + 지도 자동 이동
      if (gpsState !== 'ok') {
        gpsState = 'ok';
        if (kakaoMap) {
          kakaoMap.panTo(new kakao.maps.LatLng(userLat, userLng));
        }
      }

      _updateMyLocationDot(); // 블루 닷 위치 갱신
    },
    (err) => {
      if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
        gpsState = 'denied';
        showToast('📍 위치 권한을 허용해야 도장을 찍을 수 있습니다.');
      } else if (err.code === GeolocationPositionError.TIMEOUT) {
        gpsState = 'error';
        console.warn('[Chaeum GPS] 위치 요청 타임아웃');
      } else {
        gpsState = 'error';
        console.warn('[Chaeum GPS] 위치 오류:', err.message);
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

/**
 * GPS 감시 중지 (페이지 언로드 or 앱 종료 시)
 */
function stopGPSWatch() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
}

/**
 * 블루 돇 CustomOverlay 생성 또는 이동
 * - GPS 업데이트마다 호출되어 현재 위치를 나타냄
 */
function _updateMyLocationDot() {
  if (!kakaoMap || userLat === null || userLng === null) return;

  const pos = new kakao.maps.LatLng(userLat, userLng);

  if (!myLocationOverlay) {
    // 최초 생성
    myLocationOverlay = new kakao.maps.CustomOverlay({
      position: pos,
      content:  '<div class="my-location-dot"><div class="my-location-pulse"></div></div>',
      zIndex:   10,
      yAnchor:  0.5,
    });
    myLocationOverlay.setMap(kakaoMap);
  } else {
    // 이미 있는 오버레이 위치만 업데이트
    myLocationOverlay.setPosition(pos);
  }
}

/**
 * 리센터 — 내 위치로 지도 중심 스무스하게 이동
 */
function recenterMap() {
  if (!kakaoMap) return;

  if (gpsState === 'denied') {
    showToast('📍 위치 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.');
    return;
  }
  if (gpsState === 'pending' || userLat === null || userLng === null) {
    showToast('📡 GPS 신호를 수신하는 중입니다. 잠시 후 다시 눌러주세요.');
    return;
  }
  if (gpsState === 'error') {
    showToast('⚠️ GPS 신호를 받지 못했습니다. 위치 권한을 확인해 주세요.');
    return;
  }

  kakaoMap.panTo(new kakao.maps.LatLng(userLat, userLng));
}

// ════════════════════════════════════════════════════════
//  유틸리티
// ════════════════════════════════════════════════════════
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

  // 마이페이지 진입 시 데이터 실시간 갱신
  if (tabId === 'mypage') renderMypage();
  
  // 카카오맵 탭 진입 시 레이아웃 재계산 (흰 화면 방지)
  if (tabId === 'map' && kakaoMap) {
    setTimeout(() => {
      kakaoMap.relayout();
      // 기존 위치 유지를 위해 최근 center값으로 panTo를 하거나 내 위치로 리센터
      if (userLat !== null && userLng !== null) {
        kakaoMap.panTo(new kakao.maps.LatLng(userLat, userLng));
      }
    }, 0);
  }
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
  if (!supabase) {
    enterCrew('demo-crew-id', 'DEMO01', '데모 지도');
    return;
  }
  setEntryLoading(true);
  document.getElementById('entry-error').classList.add('hidden');
  const inviteCode = generateInviteCode();
  const { data, error } = await supabase
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
  if (!supabase) {
    enterCrew('demo-crew-id', code, '데모 지도');
    return;
  }
  setEntryLoading(true);
  document.getElementById('entry-error').classList.add('hidden');
  const { data, error } = await supabase
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
function openConquerModal(spotId, spotName, spotLat, spotLng) {
  // ── GPS 50m Locking 체크 ──────────────────────────────
  if (spotLat !== undefined && spotLng !== undefined) {
    if (userLat === null || userLng === null) {
      showToast('📍 GPS 신호를 잡는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const dist = calcDistanceMeters(userLat, userLng, spotLat, spotLng);
    if (dist > 50) {
      showToast(`📍 아직 너무 멉니다. (현재 거리: ${Math.round(dist)}m)`);
      return;
    }
  }
  // ─────────────────────────────────────────────────────

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
  if (!supabase) {
    console.log('[Chaeum] 데모 모드 점령:', { spotId, message });
    _applyConqueredState(spotId, spotName, message, myUserColor, myUserUUID);
    closeConquerModal();
    return;
  }

  const { error } = await supabase
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
/**
 * 도장 점령 상태 적용 (슬램 애니메이션)
 * @param {boolean} skipAnim true = DB에서 불러온 기존 점령, 애니메이션 없이 즉시 파란 뱃지
 */
function _applyConqueredState(spotId, spotName, message, userColor, userUuid, skipAnim = false) {
  stampStateCache[spotId] = { message, user_color: userColor, user_uuid: userUuid };

  const scene   = document.getElementById(`scene-${spotId}`);
  const wrapper = document.getElementById(`wrapper-${spotId}`);
  const badge   = document.getElementById(`badge-${spotId}`);
  const label   = wrapper?.querySelector('.stamp-label');

  if (!badge) return;

  if (skipAnim) {
    // DB에서 불러온 기존 점령 — 애니메이션 없이 즉시 파란 뱃지
    badge.src = '/icon-badge-blue.png';
    badge.classList.add('is-captured');
  } else {
    // 슬램 애니메이션 트리거
    scene?.classList.add('is-slamming');
    
    // 도장이 바닥에 닿는 순간(전체 0.5초 중 40% = 0.2초)에 맞춰 먼지 파티클 재생
    setTimeout(() => {
      playDustEffect(spotId);
    }, 200);

    setTimeout(() => {
      badge.src = '/icon-badge-blue.png';
      badge.classList.add('is-captured');
      scene?.classList.remove('is-slamming');
      addPoints(100);
      showToast(`⚔️ ${spotName} 점령 완료! +100 포인트`);
    }, 500);
  }

  // ... (라벨 스타일 등 변경) ...

  wrapper?.classList.add('conquered');
  if (label) label.classList.add('conquered');
  scene?.setAttribute('onclick', `showStampPopup('${spotId}', '${spotName.replace(/'/g, "\'")}')` );
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

  // 재점령 버튼: spotsDataCache에서 좌표 조회 후 GPS 체크와 함께 전달
  document.getElementById('popup-reconquer-btn').onclick = () => {
    closeStampPopup();
    const spotCoords = spotsDataCache[spotId];
    openConquerModal(spotId, spotName, spotCoords?.lat, spotCoords?.lng);
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
  if (!supabase || !spotIds.length) return;

  // 각 spot_id별로 가장 최근 stamp 1개씩 SELECT
  const { data, error } = await supabase
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
  if (!supabase) {
    return [
      { id: 'demo-1', name: '정자 로스터리 카페',     lat: 37.3610, lng: 127.1121, type: 'official', emoji: '☕' },
      { id: 'demo-2', name: '정자 파스타 맛집',        lat: 37.3598, lng: 127.1135, type: 'official', emoji: '🍝' },
      { id: 'demo-3', name: '정자 한강뷰 디저트카페',  lat: 37.3625, lng: 127.1098, type: 'official', emoji: '🍰' },
    ];
  }
  const { data: officialSpots, error: e1 } = await supabase
    .from('spots').select('*').eq('type', 'official');
  if (e1) console.error('[Chaeum] official spots 조회 실패:', e1);

  const { data: crewSpots, error: e2 } = await supabase
    .from('spots').select('*').eq('crew_id', crewId).eq('type', 'user');
  if (e2) console.error('[Chaeum] crew spots 조회 실패:', e2);

  return [...(officialSpots || []), ...(crewSpots || [])];
}

// ════════════════════════════════════════════════════════
//  CustomOverlay HTML 빌더
// ════════════════════════════════════════════════════════
function buildStampHTML(spot) {
  const isOfficial = spot.type === 'official';
  const labelClass = isOfficial ? 'stamp-label official' : 'stamp-label';
  const safeName = spot.name.replace(/'/g, "\'");

  return `
    <div class="stamp-overlay-wrapper" id="wrapper-${spot.id}">
      <div class="stamp-scene" id="scene-${spot.id}"
           onclick="openConquerModal('${spot.id}', '${safeName}', ${spot.lat}, ${spot.lng})">
        <!-- 레이어1: 바닥 뱃지 -->
        <img class="badge-img" id="badge-${spot.id}" src="/icon-badge-black.png" alt="badge" />
        <!-- 레이어2: 공중 3D 도장 무기 -->
        <img class="stamp-weapon" id="weapon-${spot.id}" src="/stamp-flipped.png" alt="stamp" />
        <!-- 레이어3: 먼지 파티클 캔버스 (씬 크기보다 넉넉하게) -->
        <canvas class="dust-canvas" id="canvas-${spot.id}" width="140" height="140"></canvas>
      </div>
      <div class="${labelClass}" id="label-${spot.id}">${spot.name}</div>
    </div>
  `;
}

// ════════════════════════════════════════════════════════
//  먼지 파티클 이펙트 (Canvas)
// ════════════════════════════════════════════════════════
function playDustEffect(spotId) {
  const canvas = document.getElementById(`canvas-${spotId}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2 + 10; // 도장 닿는 위치(뱃지 중심보다 살짝 아래)

  const particles = [];
  const numParticles = 25; // 파티클 개수

  for (let i = 0; i < numParticles; i++) {
    const angle = Math.random() * Math.PI * 2;
    // 충격파처럼 방사형으로 퍼지는 속도
    const speed = Math.random() * 4 + 2; 
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.5 - (Math.random() * 2), // y축은 살짝 눌린 타원형 + 위로 튀어오르는 성질
      radius: Math.random() * 4 + 2,
      life: 1.0,
      decay: Math.random() * 0.03 + 0.02,
      color: Math.random() > 0.5 ? 'rgba(230,230,230,' : 'rgba(200,200,210,' // 회백색 먼지
    });
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);
    let active = false;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.life > 0) {
        active = true;
        p.x += p.vx;
        p.y += p.vy;
        
        // 마찰력 (속도 감속)
        p.vx *= 0.92;
        p.vy *= 0.92;
        
        // 서서히 위로 떠오르는 효과 (중력 반대)
        p.vy -= 0.1;
        
        // 크기가 커지면서 투명해짐
        p.radius += 0.2;
        p.life -= p.decay;

        if (p.life > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color + p.life + ')';
          ctx.fill();
        }
      }
    }

    if (active) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, width, height); // 깔끔하게 지우기
    }
  }

  animate();
}

// ════════════════════════════════════════════════════════
//  renderSpotsOnMap — spots 지도에 렌더링 후 stamp 상태 반영
// ════════════════════════════════════════════════════════
function renderSpotsOnMap(spots) {
  if (!kakaoMap || !spots?.length) return;

  spots.forEach(spot => {
    // 좌표 캐시에 저장 — 재점령 시 GPS 체크에 사용
    spotsDataCache[spot.id] = { lat: spot.lat, lng: spot.lng };
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(spot.lat, spot.lng),
      content:  buildStampHTML(spot),
      yAnchor:  0.5, // 도장(원형)의 정중앙이 좌표에 오도록 0.5로 설정
      zIndex:   spot.type === 'official' ? 4 : 3,
    });
    overlay.setMap(kakaoMap);
  });

  console.log(`[Chaeum] ${spots.length}개 스팟 렌더링 완료`);
  _trackRenderedSpots(spots); // Realtime 필터용 목록 갱신

  // 스팟 렌더링 직후 — 기존 점령 상태를 로드해 UI에 반영
  const spotIds = spots.map(s => s.id);
  loadStampStates(spotIds).then(() => {
    // 캐시에 있는 점령 상태를 각 도장에 즉시 반영
    spots.forEach(spot => {
      const state = stampStateCache[spot.id];
      if (state) {
        _applyConqueredState(spot.id, spot.name, state.message, state.user_color, state.user_uuid, true);
      }
    });
  });
}

// ════════════════════════════════════════════════════════
//  Kakao Map 초기화
// ════════════════════════════════════════════════════════
function initKakaoMap(crewId) {
  if (typeof kakao === 'undefined' || !kakao.maps) {
    alert('카카오맵을 불러오지 못했습니다. (도메인 미등록 또는 API 키 오류)');
    console.error('Kakao Maps API is not loaded.');
    return;
  }

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

  // 지도 클릭 이벤트 — 장소 추가 모드일 때만 동작
  kakao.maps.event.addListener(kakaoMap, 'click', function(mouseEvent) {
    if (!isAddSpotMode) return;
    onMapClickAddSpot(mouseEvent.latLng);
  });

  fetchAndRender(crewId);

  // 지도 진입 시 GPS 감시 시작
  startGPSWatch();
}

async function fetchAndRender(crewId) {
  const spots = await fetchSpots(crewId);
  renderSpotsOnMap(spots);
  subscribeToRealtime(); // 실시간 점령 + 장소 동기화 시작
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

// GPS watch 메모리 누수 방지
window.addEventListener('beforeunload', () => stopGPSWatch());

// ════════════════════════════════════════════════════════
//  마이페이지 렌더링
// ════════════════════════════════════════════════════════
async function renderMypage() {
  // ── 1. Supabase에서 내 유저 데이터 재조회 ─────────────────────────────
  let myTitle = '비기는 탐험가';  // Supabase 미연동 시 폴백
  if (supabase) {
    const deviceUUID = localStorage.getItem('chaeum_user_uuid');
    if (deviceUUID) {
      const { data, error } = await supabase
        .from('users')
        .select('points, title')
        .eq('id', deviceUUID)
        .single();
      if (!error && data) {
        points  = data.points ?? points;
        myTitle = data.title  || myTitle;
        // 포인트 상단 바에도 동기화
        const topEl = document.getElementById('user-points');
        if (topEl) topEl.textContent = points.toLocaleString();
      }
    }
  }

  // ── 2. 칭호 + UUID 표시 ────────────────────────────────────────
  const titleEl = document.getElementById('mypage-title-badge');
  if (titleEl) titleEl.textContent = myTitle;

  const uuidEl = document.getElementById('mypage-uuid');
  if (uuidEl && myUserUUID) uuidEl.textContent = `ID: ${myUserUUID.slice(0, 8)}…`;

  // ── 3. 도장 색깔 표시 ───────────────────────────────────────
  const colorDot     = document.getElementById('mypage-color-dot');
  const colorPreview = document.getElementById('mypage-color-preview');
  if (myUserColor) {
    if (colorDot)     colorDot.style.background = myUserColor;
    if (colorPreview) colorPreview.style.background = myUserColor;
  }

  // ── 4. 눈적 포인트 표시 ─────────────────────────────────────
  const pointsEl = document.getElementById('mypage-points');
  if (pointsEl) pointsEl.textContent = points.toLocaleString();

  // ── 5. 내가 점령한 도장 수 ───────────────────────────────────
  const myStampCount = Object.values(stampStateCache)
    .filter(s => s.user_uuid === myUserUUID).length;
  const stampCountEl = document.getElementById('mypage-stamp-count');
  if (stampCountEl) stampCountEl.textContent = myStampCount;

  // ── 6. 크루 이름 ──────────────────────────────────────────────
  const crewName   = localStorage.getItem('chaeum_crew_name') || '-';
  const crewNameEl = document.getElementById('mypage-crew-name');
  if (crewNameEl) crewNameEl.textContent = crewName;

  // ── 7. 크루 점령 현황 (도장별 누가 점령 중인지) ─────────────────
  _renderCrewStamps();
}

/**
 * 크루 점령 현황 — stampStateCache + spotsDataCache 기반으로 렌더링
 */
function _renderCrewStamps() {
  const container = document.getElementById('mypage-crew-stamps');
  if (!container) return;

  const entries = Object.entries(stampStateCache);
  if (!entries.length) {
    container.innerHTML = '<p class="mypage-crew-empty">아직 점령된 도장이 없습니다.</p>';
    return;
  }

  container.innerHTML = entries.map(([spotId, state]) => {
    const labelEl  = document.getElementById(`label-${spotId}`);
    const spotName = labelEl ? labelEl.textContent : spotId;
    const isMe     = state.user_uuid === myUserUUID;
    const badge    = isMe ? '🟢 내가 점령 중' : '🔴 다른 탐험가';
    return `
      <div class="mypage-crew-stamp-row">
        <div class="mypage-crew-stamp-color" style="background:${state.user_color}"></div>
        <div class="mypage-crew-stamp-info">
          <span class="mypage-crew-stamp-name">${spotName}</span>
          <span class="mypage-crew-stamp-badge">${badge}</span>
        </div>
        <div class="mypage-crew-stamp-msg">"${state.message}"</div>
      </div>`;
  }).join('');
}

/**
 * 크루 데이터 리셋 후 진입 화면으로 이동 (새 지도 만들기)
 */
function resetAndGoEntry() {
  if (!confirm('현재 지도에서 나가 새 지도를 만드시겠습니까?')) return;
  localStorage.removeItem('chaeum_crew_id');
  localStorage.removeItem('chaeum_crew_code');
  localStorage.removeItem('chaeum_crew_name');
  currentCrewId = null;
  currentCrewCode = null;
  document.getElementById('bottom-nav').classList.add('hidden');
  switchTab('entry');
}

// ════════════════════════════════════════════════════════
//  장소 추가 기능 (지도 클릭 방식)
// ════════════════════════════════════════════════════════

let isAddSpotMode = false;      // 장소 추가 모드 여부
let tempAddMarker = null;       // 카카오맵 CustomOverlay 임시 마커
let _pendingSpotLatLng = null;  // 확정된 위도/경도를 임시 저장

// FAB 토글 (모드 진입/종료)
function toggleAddSpotMode() {
  if (isAddSpotMode) {
    exitAddSpotMode(true); // 취소 시 pending 데이터도 삭제
  } else {
    isAddSpotMode = true;
    document.getElementById('fab-add-spot').classList.add('active');
    document.getElementById('add-spot-banner').classList.remove('hidden');
  }
}

function exitAddSpotMode(clearPending = true) {
  isAddSpotMode = false;
  document.getElementById('fab-add-spot').classList.remove('active');
  document.getElementById('add-spot-banner').classList.add('hidden');
  removeTempMarker();
  if (clearPending) {
    _pendingSpotLatLng = null;
  }
}

function removeTempMarker() {
  if (tempAddMarker) {
    tempAddMarker.setMap(null);
    tempAddMarker = null;
  }
}

// 지도 클릭 시 임시 마커 생성
function onMapClickAddSpot(latlng) {
  // 기존 임시 마커 제거
  removeTempMarker();

  const markerHTML = `
    <div class="temp-marker-wrap">
      <div class="temp-marker-pin">
        <span class="temp-marker-pin-inner">📍</span>
      </div>
      <button class="temp-marker-btn" onclick="confirmTempSpot(${latlng.getLat()}, ${latlng.getLng()})">여기에 추가</button>
    </div>
  `;

  tempAddMarker = new kakao.maps.CustomOverlay({
    position: latlng,
    content:  markerHTML,
    yAnchor:  1.0, // 핀의 끝부분이 좌표에 닿도록 1.0으로 수정
    zIndex:   30,
    clickable: true // 클릭 이벤트가 지도로 넘어가지 않도록 방지
  });
  tempAddMarker.setMap(kakaoMap);
}

// 임시 마커의 "여기에 추가" 버튼 클릭 → 이름 입력 모달 열기
function confirmTempSpot(lat, lng) {
  _pendingSpotLatLng = { lat, lng };
  // 모달을 열기 위해 UI 상태만 끄고, 위치 정보는 보존
  exitAddSpotMode(false);
  
  document.getElementById('add-spot-name-input').value = '';
  document.getElementById('add-spot-modal-backdrop').classList.remove('hidden');
  setTimeout(() => document.getElementById('add-spot-name-input').focus(), 300);
}

// 이름 입력 모달 취소
function cancelAddSpotName() {
  document.getElementById('add-spot-modal-backdrop').classList.add('hidden');
  _pendingSpotLatLng = null;
}

// 5. 완료 → Supabase INSERT 후 즉시 마커 렌더링
async function submitNewSpot() {
  const nameInput = document.getElementById('add-spot-name-input');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.focus();
    return;
  }
  if (!_pendingSpotLatLng) return;

  const btn = document.getElementById('add-spot-confirm-btn');
  btn.disabled = true;
  btn.textContent = '추가 중...';

  const newSpot = {
    name,
    lat:     _pendingSpotLatLng.lat,
    lng:     _pendingSpotLatLng.lng,
    crew_id: currentCrewId,
    type:    'user',
    emoji:   '📌',
  };

  // Supabase 미연동 시 로컬 데모
  if (!supabase) {
    const demoSpot = { id: `local-${Date.now()}`, ...newSpot };
    renderSpotsOnMap([demoSpot]);
    document.getElementById('add-spot-modal-backdrop').classList.add('hidden');
    showToast(`📌 "${name}" 추가 완료!`);
    btn.disabled = false;
    btn.textContent = '✅ 추가하기';
    _pendingSpotLatLng = null;
    return;
  }

  const { data, error } = await supabase
    .from('spots')
    .insert([newSpot])
    .select()
    .single();

  if (error) {
    console.error('[Chaeum] 장소 추가 실패:', error);
    showToast('❌ 장소 추가에 실패했습니다.');
    btn.disabled = false;
    btn.textContent = '✅ 추가하기';
    return;
  }

  // 성공 → 즉시 지도에 마커 추가
  renderSpotsOnMap([data]);
  document.getElementById('add-spot-modal-backdrop').classList.add('hidden');
  showToast(`📌 "${data.name}" 추가 완료!`);
  btn.disabled = false;
  btn.textContent = '✅ 추가하기';
  _pendingSpotLatLng = null;
}

// ════════════════════════════════════════════════════════
//  Supabase Realtime — stamps & spots INSERT 구독
//  (실시간 점령 동기화 + 새 장소 실시간 추가)
// ════════════════════════════════════════════════════════
let _realtimeChannel = null;

// 현재 내 화면에 렌더링된 spotId 목록 (Realtime 필터용)
const _renderedSpotIds = new Set();

// renderSpotsOnMap에서 렌더링할 때 호출하여 목록 갱신
function _trackRenderedSpots(spots) {
  spots.forEach(s => _renderedSpotIds.add(s.id));
}

function subscribeToRealtime() {
  // Supabase 미연동이면 건너뜀
  if (!supabase) return;

  // 이미 구독 중이면 중복 방지
  if (_realtimeChannel) {
    console.log('[Chaeum Realtime] 이미 구독 중 — 스킵');
    return;
  }

  _realtimeChannel = supabase
    .channel('chaeum-realtime')
    // ── stamps INSERT 구독 (점령 동기화) ──
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'stamps' },
      (payload) => {
        const newStamp = payload.new;
        console.log('[Chaeum Realtime] 새 점령 수신:', newStamp);

        // 내가 방금 점령한 것이면 무시 (이미 로컬에서 UI 처리됨)
        if (newStamp.user_uuid === myUserUUID) {
          console.log('[Chaeum Realtime] 내 점령 → 스킵');
          return;
        }

        // 내 화면에 없는 스팟이면 무시 (다른 크루의 스팟)
        if (!_renderedSpotIds.has(newStamp.spot_id)) {
          console.log('[Chaeum Realtime] 내 지도에 없는 스팟 → 스킵');
          return;
        }

        // DOM에서 장소 이름 추출
        const labelEl = document.getElementById(`label-${newStamp.spot_id}`);
        const spotName = labelEl ? labelEl.textContent : '알 수 없는 장소';

        // 도장 뒤집기 + 색상 반영
        _applyConqueredState(
          newStamp.spot_id,
          spotName,
          newStamp.message,
          newStamp.user_color,
          newStamp.user_uuid
        );

        showToast(`🔔 ${spotName}이(가) 다른 탐험가에게 점령되었습니다!`);
      }
    )
    // ── spots INSERT 구독 (새 장소 실시간 추가) ──
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'spots' },
      (payload) => {
        const newSpot = payload.new;
        console.log('[Chaeum Realtime] 새 장소 수신:', newSpot);

        // 내 크루의 user 스팟이거나, official 스팟일 때만 렌더링
        if (newSpot.type === 'official' || newSpot.crew_id === currentCrewId) {
          // 이미 내 화면에 있으면 스킵 (내가 방금 추가한 것)
          if (_renderedSpotIds.has(newSpot.id)) {
            console.log('[Chaeum Realtime] 이미 렌더링된 스팟 → 스킵');
            return;
          }
          renderSpotsOnMap([newSpot]);
          showToast(`📍 "${newSpot.name}" 새 장소가 추가되었습니다!`);
        }
      }
    )
    .subscribe((status) => {
      console.log('[Chaeum Realtime] 구독 상태:', status);
    });
}

// ════════════════════════════════════════════════════════
//  HTML onclick 연결 — ES 모듈 함수는 자동 전역 등록 안 됨
// ════════════════════════════════════════════════════════
Object.assign(window, {
  switchTab,
  handleCreateCrew,
  handleJoinCrew,
  showCrewCode,
  closeCrewModal,
  copyCrewCode,
  openConquerModal,
  closeConquerModal,
  submitConquer,
  showStampPopup,
  closeStampPopup,
  reopenConquerFromPopup,
  recenterMap,
  toggleAddSpotMode,
  cancelAddSpotName,
  submitNewSpot,
  resetAndGoEntry,
  confirmTempSpot,
  updateComboPreview,
});
