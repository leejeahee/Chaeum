// ════════════════════════════════════════════════════════
//  Chaeum Admin — admin.js
//  공식 위치(official spot) 추가 운영자 도구
// ════════════════════════════════════════════════════════

// 카테고리별 기본 이모지 제안
const CATEGORY_EMOJI = { '카페': '☕', '식당': '🍽️', '기타': '📍' };
// 지도 초기 중심 (정자역)
const MAP_CENTER = { lat: 37.3610, lng: 127.1121 };

let adminMap   = null;
let pickMarker = null;

// ─── 유틸 ───────────────────────────────────────────
function supabaseReady() {
  return !!(window._supabaseReady && window._supabaseClient);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearFormError() {
  document.getElementById('form-error').classList.add('hidden');
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
         lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// ─── 지도 ───────────────────────────────────────────
function initAdminMap() {
  const el = document.getElementById('admin-map');
  if (!el) return;

  // SDK 미로드 가드 (file://로 열었거나 네트워크/도메인 문제)
  if (typeof kakao === 'undefined' || !kakao.maps) {
    el.innerHTML = '<p class="map-error">지도를 불러오지 못했습니다.<br>로컬 서버(http)로 실행했는지, 앱키 도메인이 등록됐는지 확인하세요.</p>';
    return;
  }

  kakao.maps.load(() => {
    adminMap = new kakao.maps.Map(el, {
      center: new kakao.maps.LatLng(MAP_CENTER.lat, MAP_CENTER.lng),
      level: 4,
    });
    adminMap.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

    // 지도 클릭 → 좌표 자동 입력 + 마커 이동
    kakao.maps.event.addListener(adminMap, 'click', (mouseEvent) => {
      const latlng = mouseEvent.latLng;
      setLatLngFields(latlng.getLat(), latlng.getLng());
      placeMarker(latlng);
    });
  });
}

function placeMarker(latlng) {
  if (!pickMarker) {
    pickMarker = new kakao.maps.Marker({ position: latlng });
    pickMarker.setMap(adminMap);
  } else {
    pickMarker.setPosition(latlng);
  }
}

function setLatLngFields(lat, lng) {
  document.getElementById('lat').value = Number(lat).toFixed(6);
  document.getElementById('lng').value = Number(lng).toFixed(6);
  clearFormError();
}

// 위도/경도 수동 편집 → 마커 + 지도 중심 동기화
function syncMarkerFromFields() {
  if (!adminMap) return;
  const lat = parseFloat(document.getElementById('lat').value);
  const lng = parseFloat(document.getElementById('lng').value);
  if (!isValidLatLng(lat, lng)) return;
  const latlng = new kakao.maps.LatLng(lat, lng);
  placeMarker(latlng);
  adminMap.setCenter(latlng);
}

// ─── 카테고리 → 기본 이모지 제안 ───────────────────
function onCategoryChange() {
  const cat = document.getElementById('category').value;
  const emojiEl = document.getElementById('emoji');
  const defaults = Object.values(CATEGORY_EMOJI);
  // 이모지가 비었거나 기존 기본값이면 카테고리 기본값으로 교체 (수동 입력은 보존)
  if (!emojiEl.value || defaults.includes(emojiEl.value)) {
    emojiEl.value = CATEGORY_EMOJI[cat] || '';
  }
}

// ─── 제출 ───────────────────────────────────────────
async function handleSubmit() {
  clearFormError();

  const name     = document.getElementById('name').value.trim();
  const lat      = parseFloat(document.getElementById('lat').value);
  const lng      = parseFloat(document.getElementById('lng').value);
  const category = document.getElementById('category').value;
  const emoji    = document.getElementById('emoji').value.trim() || CATEGORY_EMOJI[category] || '📍';
  const address  = document.getElementById('address').value.trim();

  if (!name)                    return showFormError('상호명을 입력하세요.');
  if (!isValidLatLng(lat, lng)) return showFormError('지도를 클릭하거나 올바른 위도/경도를 입력하세요.');
  if (!supabaseReady())         return showFormError('Supabase가 설정되지 않아 저장할 수 없습니다.');

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = '추가 중...';

  const { data, error } = await window._supabaseClient
    .from('spots')
    .insert([{
      name,
      lat,
      lng,
      type: 'official',
      crew_id: null,
      emoji,
      category,
      address: address || null,
    }])
    .select()
    .single();

  btn.disabled = false;
  btn.textContent = '위치 추가';

  if (error) {
    console.error('[Admin] spot INSERT 실패:', error);
    showToast('❌ 추가 실패: ' + error.message);
    return;
  }

  showToast('✅ 추가 완료: ' + name);
  prependRecentItem(data);
  resetForm();
}

function resetForm() {
  ['name', 'lat', 'lng', 'address'].forEach(id => { document.getElementById(id).value = ''; });
  onCategoryChange(); // 이모지를 현재 카테고리 기본값으로 리셋
  // 지도 중심/마커는 유지 (다음 위치 클릭 시 갱신)
}

// ─── 최근 추가 목록 ─────────────────────────────────
async function loadRecent() {
  if (!supabaseReady()) return;
  const { data, error } = await window._supabaseClient
    .from('spots')
    .select('id, name, lat, lng, emoji, category, created_at')
    .eq('type', 'official')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[Admin] 최근 목록 로드 실패:', error);
    return;
  }
  const ul = document.getElementById('recent-list');
  ul.innerHTML = '';
  (data || []).forEach(spot => ul.appendChild(buildRecentItem(spot)));
  updateRecentEmpty();
}

function buildRecentItem(spot) {
  const li = document.createElement('li');
  li.className = 'recent-item';
  li.innerHTML =
    `<span class="ri-emoji">${escapeHtml(spot.emoji || '📍')}</span>` +
    `<span class="ri-name">${escapeHtml(spot.name)}</span>` +
    `<span class="ri-cat">${escapeHtml(spot.category || '-')}</span>` +
    `<span class="ri-coord">${Number(spot.lat).toFixed(4)}, ${Number(spot.lng).toFixed(4)}</span>`;
  return li;
}

function prependRecentItem(spot) {
  const ul = document.getElementById('recent-list');
  ul.insertBefore(buildRecentItem(spot), ul.firstChild);
  while (ul.children.length > 10) ul.removeChild(ul.lastChild); // 10개 유지
  updateRecentEmpty();
}

function updateRecentEmpty() {
  const ul = document.getElementById('recent-list');
  const empty = document.getElementById('recent-empty');
  if (empty) empty.classList.toggle('hidden', ul.children.length > 0);
}

// ─── 진입 ───────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Supabase 미설정 → 경고 배너 + 저장 비활성화
  if (!supabaseReady()) {
    document.getElementById('supabase-warning').classList.remove('hidden');
    document.getElementById('submit-btn').disabled = true;
  }

  // 이벤트 연결
  document.getElementById('category').addEventListener('change', onCategoryChange);
  document.getElementById('lat').addEventListener('change', syncMarkerFromFields);
  document.getElementById('lng').addEventListener('change', syncMarkerFromFields);
  document.getElementById('submit-btn').addEventListener('click', handleSubmit);

  onCategoryChange(); // 초기 이모지 기본값 세팅

  // 지도 초기화 (SDK 늦게 뜨면 window load 후 재시도)
  if (typeof kakao !== 'undefined') initAdminMap();
  else window.addEventListener('load', initAdminMap);

  // 최근 목록 로드
  loadRecent();
});
