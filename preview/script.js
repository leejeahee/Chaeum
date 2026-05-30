// ─── App State ───
let points = 1708;

// ─── 테스트용 장소 데이터 (분당 근처 실제 좌표) ───
const stampPlaces = [
  {
    id: 'place_1',
    name: '정자동 파스타집',
    lat: 37.3595,
    lng: 127.1156,
    flipped: false,
  },
  {
    id: 'place_2',
    name: '서현역 보드게임카페',
    lat: 37.3830,
    lng: 127.1219,
    flipped: false,
  },
  {
    id: 'place_3',
    name: '분당 로스터리 카페',
    lat: 37.3710,
    lng: 127.1080,
    flipped: false,
  },
];

// ─── 탭 전환 ───
function switchTab(tabId) {
  document.querySelectorAll('.screen-content').forEach(el => {
    el.classList.add('hidden');
  });
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
  });

  const targetScreen = document.getElementById(`screen-${tabId}`);
  if (targetScreen) targetScreen.classList.remove('hidden');

  const navItem = document.getElementById(`nav-${tabId}`);
  if (navItem) navItem.classList.add('active');
}

// ─── 포인트 업데이트 ───
function addPoints(amount) {
  points += amount;
  document.getElementById('user-points').textContent = points.toLocaleString();
}

// ─── 토스트 메시지 ───
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── CustomOverlay 내부 HTML 빌더 ───
function buildStampHTML(place) {
  return `
    <div class="stamp-overlay-wrapper" id="wrapper-${place.id}">
      <div class="stamp-scene" id="scene-${place.id}" onclick="flipStamp('${place.id}')">
        <div class="stamp-card" id="card-${place.id}">
          <div class="stamp-face front">
            <img src="gray_stamp.png" alt="미방문" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size:28px;filter:grayscale(1)\\'>📍</span>'">
          </div>
          <div class="stamp-face back">
            <img src="color_stamp.png" alt="방문완료" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'font-size:28px\\'>🎉</span>'">
          </div>
        </div>
        <div class="stamp-badge" id="badge-${place.id}">✓</div>
      </div>
      <div class="stamp-label">${place.name}</div>
    </div>
  `;
}

// ─── 도장 클릭 → 뒤집기 ───
function flipStamp(placeId) {
  const place = stampPlaces.find(p => p.id === placeId);
  if (!place) return;

  const card = document.getElementById(`card-${placeId}`);
  const scene = document.getElementById(`scene-${placeId}`);
  if (!card) return;

  place.flipped = !place.flipped;

  if (place.flipped) {
    card.classList.add('is-flipped');
    scene.classList.add('flipped');
    addPoints(50);
    showToast(`🎉 ${place.name} 도장 획득! +50 포인트`);
  } else {
    card.classList.remove('is-flipped');
    scene.classList.remove('flipped');
  }
}

// ─── Kakao Map 초기화 ───
function initKakaoMap() {
  const mapContainer = document.getElementById('kakao-map');

  // 분당 중심 좌표
  const mapOption = {
    center: new kakao.maps.LatLng(37.3714, 127.1133),
    level: 5,
  };

  const map = new kakao.maps.Map(mapContainer, mapOption);

  // 지도 컨트롤 추가
  const zoomControl = new kakao.maps.ZoomControl();
  map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

  // ─── 각 장소에 CustomOverlay 렌더링 ───
  stampPlaces.forEach(place => {
    const position = new kakao.maps.LatLng(place.lat, place.lng);

    const overlay = new kakao.maps.CustomOverlay({
      position,
      content: buildStampHTML(place),
      yAnchor: 1.0,
      zIndex: 3,
    });

    overlay.setMap(map);
  });
}

// ─── DOMContentLoaded ───
window.addEventListener('DOMContentLoaded', () => {
  // 토스트 엘리먼트 동적 추가
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  document.querySelector('.phone-container').appendChild(toast);

  // 포인트 초기 렌더
  document.getElementById('user-points').textContent = points.toLocaleString();

  // 초기 탭
  switchTab('map');

  // Kakao Maps 초기화
  // SDK가 비동기 로드되므로 kakao 객체 준비 후 실행
  if (typeof kakao !== 'undefined' && kakao.maps) {
    kakao.maps.load(initKakaoMap);
  } else {
    // SDK 로드 타이밍 문제 대비 fallback
    window.addEventListener('load', () => {
      if (typeof kakao !== 'undefined') {
        kakao.maps.load(initKakaoMap);
      }
    });
  }
});
