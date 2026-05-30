// App State
let points = 1708;
let equippedSlots = {};
let equippedTitle = null;
let appMode = 'planning'; // 'adventure' or 'planning'
let isMissionActive = false;

// Route Planning Data (Bundang MVP)
let currentThemeId = null;
let currentStepIndex = 0;
let selectedRoute = [];

const routeThemes = [
  { id: 'theme_jeongja', title: '정자 카페거리 완벽 데이트', desc: '분위기 좋은 카페와 산책로가 어우러진 코스', emoji: '☕' },
  { id: 'theme_seohyeon', title: '서현역 도파민 액티비티', desc: '방탈출부터 보드게임까지 지루할 틈 없는 코스', emoji: '🎲' }
];

const routeData = {
  theme_jeongja: [
    {
      stepTitle: 'Step 1. 점심 식사',
      options: [
        { id: 'place_j1', name: '정자 ㅁㅁ파스타', desc: '분위기 좋은 양식당', img: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=300&q=80' },
        { id: 'place_j2', name: '정자 ㅇㅇ스시', desc: '깔끔한 오마카세', img: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=300&q=80' }
      ]
    },
    {
      stepTitle: 'Step 2. 여유로운 커피 타임',
      options: [
        { id: 'place_j3', name: '정자 ㅂㅂ로스터리', desc: '핸드드립 전문점', img: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=300&q=80' },
        { id: 'place_j4', name: '정자 ㅅㅅ디저트', desc: '수제 케이크 맛집', img: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=300&q=80' }
      ]
    }
  ],
  theme_seohyeon: [
    {
      stepTitle: 'Step 1. 든든한 한 끼',
      options: [
        { id: 'place_s1', name: '서현 ㅋㅋ돈까스', desc: '바삭한 치즈돈까스', img: 'https://images.unsplash.com/photo-1595295333158-4742f28fbd85?auto=format&fit=crop&w=300&q=80' },
        { id: 'place_s2', name: '서현 ㅍㅍ마라탕', desc: '스트레스 쫙 풀리는 매운맛', img: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cb431?auto=format&fit=crop&w=300&q=80' }
      ]
    },
    {
      stepTitle: 'Step 2. 도파민 폭발 액티비티',
      options: [
        { id: 'place_s3', name: '서현 ㅎㅎ방탈출', desc: '공포 테마 1위', img: 'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?auto=format&fit=crop&w=300&q=80' },
        { id: 'place_s4', name: '서현 ㅉㅉ보드게임', desc: '프라이빗 룸 완비', img: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=300&q=80' }
      ]
    }
  ]
};

function saveState() {
  const state = { points, equippedSlots, equippedTitle, appMode };
  localStorage.setItem('chaeumMVPState', JSON.stringify(state));
}

// Item type data for overlay positioning
const itemData = {
  '🪄': 'hand',        // magic wand → right hand
  '💍': 'hand',        // ring → right hand
  '🪖': 'head',        // military helmet → head
  '🛡️': 'hand-left',  // shield → left hand
  '👟': 'feet',        // sneakers → feet
  '🏹': 'hand'         // bow → right hand
};

function loadState() {
  // ── Supabase DB 값이 있으면 localStorage보다 우선 적용 ──
  // supabase_init.js의 initUser()가 완료되면 window._pendingUserState에 DB 데이터를 담아둠.
  // loadState()는 DOMContentLoaded 이후 실행되므로, 비동기 흐름이 겹치는 경우를 대비해
  // _pendingUserState를 폴링 방식으로 기다리는 대신 즉시 체크 후 적용함.
  // (Supabase 응답이 아직 오지 않은 경우 localStorage 값으로 먼저 렌더링하고,
  //  initUser() 완료 시 applyDBState()를 통해 UI를 갱신하는 구조.)
  if (window._pendingUserState) {
    _applyDBStateToUI(window._pendingUserState);
    window._pendingUserState = null;
    return;
  }

  const saved = localStorage.getItem('chaeumMVPState');
  if (saved) {
    const state = JSON.parse(saved);
    points = state.points || 0;
    equippedSlots = state.equippedSlots || {};
    equippedTitle = state.equippedTitle || null;
    appMode = state.appMode || 'planning';

    document.getElementById('user-points').innerText = points.toLocaleString();

    for (const [slotId, emoji] of Object.entries(equippedSlots)) {
      const slot = document.getElementById(slotId);
      if (slot && emoji) {
        slot.classList.remove('empty');
        slot.classList.add('filled');
        slot.textContent = emoji;
        slot.onclick = () => unequipItem(slotId, emoji);

        const invItems = document.querySelectorAll('#inv-equip .inv-item');
        invItems.forEach(item => {
          if (item.innerText.trim() === emoji) {
            item.style.opacity = '0.3';
            item.style.pointerEvents = 'none';
          }
        });
      }
    }
  }

  // Restore equipped title badge
  const badge = document.getElementById('title-badge');
  if (badge && equippedTitle) {
    badge.textContent = equippedTitle;
    document.querySelectorAll('.title-card.achieved').forEach(card => {
      const name = card.querySelector('h4')?.textContent;
      card.classList.toggle('active-title', name === equippedTitle);
    });
  }
  setAppMode(appMode, true);
}

// DB에서 받아온 유저 데이터를 UI와 전역 변수에 반영
function _applyDBStateToUI(userData) {
  if (!userData) return;

  // DB의 items(JSONB)에는 equippedSlots와 equippedTitle이 함께 저장됨
  const dbItems = userData.items || {};

  points       = userData.points || 0;
  equippedSlots = dbItems.equippedSlots || {};
  equippedTitle = dbItems.equippedTitle || null;
  // appMode는 개인화 설정이므로 localStorage 우선
  const saved = localStorage.getItem('chaeumMVPState');
  appMode = (saved ? JSON.parse(saved).appMode : null) || 'planning';

  // UI 반영
  const pointsEl = document.getElementById('user-points');
  if (pointsEl) pointsEl.innerText = points.toLocaleString();

  for (const [slotId, emoji] of Object.entries(equippedSlots)) {
    const slot = document.getElementById(slotId);
    if (slot && emoji) {
      slot.classList.remove('empty');
      slot.classList.add('filled');
      slot.textContent = emoji;
      slot.onclick = () => unequipItem(slotId, emoji);

      const invItems = document.querySelectorAll('#inv-equip .inv-item');
      invItems.forEach(item => {
        if (item.innerText.trim() === emoji) {
          item.style.opacity = '0.3';
          item.style.pointerEvents = 'none';
        }
      });
    }
  }

  const badge = document.getElementById('title-badge');
  if (badge && equippedTitle) {
    badge.textContent = equippedTitle;
    document.querySelectorAll('.title-card.achieved').forEach(card => {
      const name = card.querySelector('h4')?.textContent;
      card.classList.toggle('active-title', name === equippedTitle);
    });
  }

  setAppMode(appMode, true);
  console.log('[Chamap] DB 상태가 UI에 반영되었습니다. points:', points);
}

function setAppMode(mode, isInit = false) {
  appMode = mode;
  if (!isInit) saveState();

  const btnAdv = document.getElementById('mode-adventure');
  const btnPlan = document.getElementById('mode-planning');
  if (btnAdv && btnPlan) {
    btnAdv.classList.toggle('active', mode === 'adventure');
    btnPlan.classList.toggle('active', mode === 'planning');
  }

  const themeListEl = document.getElementById('theme-list-container');
  if (themeListEl) {
    if (mode === 'planning') {
      themeListEl.classList.remove('hidden');
    } else {
      themeListEl.classList.add('hidden');
    }
  }

  const partnerEl = document.querySelector('.character-wrapper.partner');
  const containerEl = document.querySelector('.couple-container');
  const titleText = document.getElementById('home-title-text');
  const subtitleEl = document.getElementById('home-subtitle');
  const coupleTitleSpan = document.getElementById('home-couple-title');

  if (!partnerEl) return;

  if (mode === 'adventure') {
    containerEl.classList.add('solo-mode');
    partnerEl.classList.add('hidden-mode');
    titleText.innerText = '나의 즉흥 발견';
    subtitleEl.innerText = '주변의 숨겨진 장소를 찾아보세요!';
    if (coupleTitleSpan) coupleTitleSpan.style.display = 'none';
  } else {
    containerEl.classList.remove('solo-mode');
    partnerEl.classList.remove('hidden-mode');
    titleText.innerText = '분당 탐험가';
    subtitleEl.innerText = '오늘의 동선을 설계해 보세요!';
    if (coupleTitleSpan) coupleTitleSpan.style.display = 'inline';
  }
}

// Route Planning Functions
function startTheme(themeId) {
  currentThemeId = themeId;
  currentStepIndex = 0;
  selectedRoute = [];
  
  const themeData = routeThemes.find(t => t.id === themeId);
  if (themeData) {
    document.getElementById('map-theme-title').innerText = themeData.title;
  }
  
  switchTab('map');
  document.getElementById('n-choice-ui').classList.remove('hidden');
  document.getElementById('bottom-sheet').classList.add('hidden');
  document.getElementById('dynamic-pins').innerHTML = '';
  
  renderRouteStep();
}

function renderRouteStep() {
  const stepData = routeData[currentThemeId][currentStepIndex];
  if (!stepData) {
    // 코스 완성
    document.getElementById('n-choice-step-title').innerText = '코스 설계 완료!';
    document.getElementById('n-choice-scroll-area').innerHTML = `
      <div style="padding: 20px; text-align: center; width: 100%;">
        <p style="margin-bottom:12px;">완벽한 코스가 준비되었습니다.</p>
        <button class="modern-btn primary-btn" onclick="startMission()">인증 미션 시작하기 (카메라)</button>
      </div>
    `;
    return;
  }

  document.getElementById('n-choice-step-title').innerText = stepData.stepTitle;
  const scrollArea = document.getElementById('n-choice-scroll-area');
  scrollArea.innerHTML = '';

  stepData.options.forEach(opt => {
    const card = document.createElement('div');
    card.className = 'n-choice-card';
    card.onclick = () => selectRouteOption(opt);
    card.innerHTML = `
      <div class="n-choice-img" style="background-image: url('${opt.img}')"></div>
      <div class="n-choice-body">
        <h4>${opt.name}</h4>
        <p>${opt.desc}</p>
      </div>
    `;
    scrollArea.appendChild(card);
  });
}

function selectRouteOption(optionObj) {
  selectedRoute.push(optionObj);
  updateMapPins();
  currentStepIndex++;
  renderRouteStep();
}

function skipRouteStep() {
  currentStepIndex++;
  renderRouteStep();
}

function updateMapPins() {
  const container = document.getElementById('dynamic-pins');
  if (!container) return;
  container.innerHTML = '';
  
  selectedRoute.forEach((opt, index) => {
    const pin = document.createElement('div');
    pin.className = 'route-pin';
    // 하드코딩된 대략적 위치로 배치 (index에 따라 사선으로 이어짐)
    pin.style.top = `${40 + index * 18}%`;
    pin.style.left = `${25 + index * 20}%`;
    
    pin.innerHTML = `
      <div class="pin-label">${opt.name}</div>
      <div class="pin-dot"></div>
    `;
    container.appendChild(pin);
  });
}

// Navigation Logic
function switchTab(tabId) {
  // Hide all screens
  document.querySelectorAll('.screen-content').forEach(el => {
    el.classList.add('hidden');
    el.style.zIndex = -1;
  });
  
  // Update Nav Items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
  });

  // Show target screen
  const targetScreen = document.getElementById(`screen-${tabId}`);
  if (targetScreen) {
    targetScreen.classList.remove('hidden');
    targetScreen.style.zIndex = 10;
  }

  // Highlight bottom nav
  if (tabId !== 'share') {
    const navItems = document.querySelectorAll('.nav-item');
    if (tabId === 'home') navItems[0].classList.add('active');
    if (tabId === 'map') navItems[1].classList.add('active');
    if (tabId === 'camera') navItems[2].classList.add('active');
    if (tabId === 'mypage') navItems[3].classList.add('active');
  }
}

// Map Bottom Sheet Logic
function openBottomSheet(title, desc) {
  document.getElementById('sheet-title').innerText = title;
  document.getElementById('sheet-desc').innerText = desc;
  document.getElementById('bottom-sheet').classList.add('open');
  document.getElementById('sheet-overlay').classList.add('show');
}

function closeBottomSheet() {
  document.getElementById('bottom-sheet').classList.remove('open');
  document.getElementById('sheet-overlay').classList.remove('show');
}

function startMission() {
  isMissionActive = true;
  closeBottomSheet();
  switchTab('camera');
}

let latestPhotoUrl = null;

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      latestPhotoUrl = e.target.result;
      document.getElementById('gallery-thumb').src = latestPhotoUrl;
      completeMission();
    }
    reader.readAsDataURL(file);
  }
}

function completeMission() {
  if (isMissionActive) {
    const loading = document.getElementById('loading-modal');
    const success = document.getElementById('success-modal');
    
    loading.classList.remove('hidden');
    
    setTimeout(() => {
      loading.classList.add('hidden');
      success.classList.remove('hidden');
      
      // 포인트 증가
      points += 50;
      document.getElementById('user-points').innerText = points.toLocaleString();
      saveState();
      isMissionActive = false;
    }, 2000);
  } else {
    alert("사진이 임시 저장되었습니다.");
  }
}

function goToUpload() {
  document.getElementById('success-modal').classList.add('hidden');
  if (latestPhotoUrl) {
    document.getElementById('upload-dummy-photo').style.backgroundImage = `url(${latestPhotoUrl})`;
  }
  switchTab('upload');
}

async function saveImage() {
  const saveBtn = document.getElementById('save-btn');
  const compositeView = document.getElementById('composite-view');
  
  if (!compositeView) return;

  const originalText = saveBtn.innerText;
  saveBtn.innerText = "저장 중...";
  saveBtn.disabled = true;
  saveBtn.style.opacity = '0.7';

  try {
    const canvas = await html2canvas(compositeView, {
      useCORS: true,
      backgroundColor: null,
      scale: 2 // High resolution
    });
    
    // Create image URL
    const imageUrl = canvas.toDataURL("image/png");
    
    // Create timestamp
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `chaeum_meme_${timestamp}.png`;
    
    // Download image
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
  } catch (error) {
    console.error("이미지 저장 실패:", error);
    alert("이미지 저장에 실패했습니다.");
  } finally {
    saveBtn.innerText = originalText;
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
  }
}

// Pixel Character Generation (16x16 Cute Charlie Blob)
// 0=transparent, 1=black outline, 2=white body
const charDesign = [
  [0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,2,2,2,2,2,2,1,0,0,0,0],
  [0,0,0,1,2,2,2,2,2,2,2,2,1,0,0,0],
  [0,0,1,2,2,1,2,2,2,1,2,2,1,0,0,0],
  [0,0,1,2,2,1,2,2,2,1,2,2,1,0,0,0],
  [0,0,1,2,2,2,2,2,2,2,2,2,1,0,0,0],
  [0,1,2,2,2,2,1,1,1,2,2,2,2,1,0,0],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0],
  [1,2,1,2,2,2,2,2,2,2,2,2,1,2,1,0],
  [1,2,1,2,2,2,2,2,2,2,2,2,1,2,1,0],
  [1,2,1,2,2,2,2,2,2,2,2,2,1,2,1,0],
  [1,2,1,2,2,2,1,1,1,2,2,2,1,2,1,0],
  [0,1,1,2,2,1,2,2,2,1,2,2,1,1,0,0],
  [0,0,1,2,2,1,2,2,2,1,2,2,1,0,0,0],
  [0,0,1,1,1,1,0,0,0,1,1,1,1,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
];

const colors = {
  0: 'transparent',
  1: '#111111', // Black outline & eyes & mouth
  2: '#FFFFFF'  // White body
};

function renderCharacter(containerSelector, pixelSizeStr = '12px') {
  const canvas = document.querySelector(containerSelector);
  if (!canvas || canvas.tagName !== 'CANVAS') return;
  
  const ctx = canvas.getContext('2d');
  const size = parseInt(pixelSizeStr, 10);
  const width = 16 * size;
  const height = 16 * size;
  
  // Set internal resolution
  canvas.width = width;
  canvas.height = height;
  
  // Set CSS size to match to avoid blur
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.imageRendering = 'pixelated';

  ctx.clearRect(0, 0, width, height);

  charDesign.forEach((row, y) => {
    row.forEach((val, x) => {
      if (val !== 0) {
        ctx.fillStyle = colors[val];
        ctx.fillRect(x * size, y * size, size, size);
      }
    });
  });
}

// Customization & Inventory Logic
function switchInvTab(tabName) {
  document.getElementById('tab-equip').classList.remove('active');
  document.getElementById('tab-title').classList.remove('active');
  document.getElementById('tab-photolog').classList.remove('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');

  document.getElementById('inv-equip').classList.add('hidden');
  document.getElementById('inv-title').classList.add('hidden');
  document.getElementById('inv-photolog').classList.add('hidden');
  document.getElementById(`inv-${tabName}`).classList.remove('hidden');
}

// currentAtk and currentHp removed

function equipItem(element, emoji) {
  const emptySlot = document.querySelector('.equip-slot.empty');
  if (emptySlot) {
    emptySlot.classList.remove('empty');
    emptySlot.classList.add('filled');
    emptySlot.textContent = emoji;
    emptySlot.onclick = () => unequipItem(emptySlot.id, emoji);
    
    element.style.opacity = '0.3';
    element.style.pointerEvents = 'none';

    equippedSlots[emptySlot.id] = emoji;
    saveState();
    
    // Add overlay on character canvas
    const type = itemData[emoji];
    if (type) {
      const overlayContainer = document.getElementById('character-overlays');
      if (overlayContainer) {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.className = `overlay-${type}`;
        span.dataset.slotId = emptySlot.id;
        overlayContainer.appendChild(span);
      }
    }

    emptySlot.style.transform = 'scale(1.2)';
    setTimeout(() => emptySlot.style.transform = 'scale(1)', 200);
  }
}

function unequipItem(slotId, emoji) {
  const slot = document.getElementById(slotId);
  if (slot) {
    slot.classList.remove('filled');
    slot.classList.add('empty');
    slot.textContent = '';
    slot.onclick = null;
    
    delete equippedSlots[slotId];
    saveState();
    
    // Remove overlay from character canvas
    const overlayContainer = document.getElementById('character-overlays');
    if (overlayContainer) {
      const existing = overlayContainer.querySelector(`[data-slot-id="${slotId}"]`);
      if (existing) existing.remove();
    }

    const invItems = document.querySelectorAll('#inv-equip .inv-item');
    invItems.forEach(item => {
      if (item.innerText.trim() === emoji) {
        item.style.opacity = '1';
        item.style.pointerEvents = 'auto';
      }
    });
  }
}

function toggleTitle(titleName) {
  const badge = document.getElementById('title-badge');
  const allCards = document.querySelectorAll('.title-card.achieved');

  if (equippedTitle === titleName) {
    // Unequip
    equippedTitle = null;
    if (badge) badge.textContent = '\uce6d\ud638\ub97c \uc120\ud0dd\ud558\uc138\uc694';
    allCards.forEach(c => c.classList.remove('active-title'));
  } else {
    // Equip new title (replace existing)
    equippedTitle = titleName;
    if (badge) badge.textContent = titleName;
    allCards.forEach(card => {
      const name = card.querySelector('h4')?.textContent;
      card.classList.toggle('active-title', name === titleName);
    });
  }
  saveState();
}

// Photolog Logic
const photologData = [
  "https://images.unsplash.com/photo-1516214104703-d2507c614b15?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1522083111333-662eb7487c53?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1542314831-c6a4d14eff42?auto=format&fit=crop&w=300&q=80",
  "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=300&q=80"
];

function renderPhotolog() {
  const grid = document.getElementById('photolog-grid');
  if (!grid) return;
  grid.innerHTML = '';
  photologData.forEach(url => {
    const div = document.createElement('div');
    div.className = 'photolog-item';
    div.style.backgroundImage = `url(${url})`;
    div.onclick = () => openPhotoModal(url);
    grid.appendChild(div);
  });
}

function openPhotoModal(url) {
  document.getElementById('zoomed-photo').src = url;
  document.getElementById('photo-modal').classList.remove('hidden');
}

function closePhotoModal() {
  document.getElementById('photo-modal').classList.add('hidden');
}

// Initialize Characters
window.onload = () => {
  loadState(); // 로컬스토리지 데이터 로딩
  renderPhotolog(); // 포토로그 렌더링
  renderCharacter('#pixel-partner', '10px'); // Partner
  renderCharacter('#pixel-mychar', '10px'); // My char
  renderCharacter('.pixel-character-overlay', '8px'); // Share overlay
  renderCharacter('#pixel-char-large', '14px'); // Archero style screen
  switchTab('home'); // Init state
};
