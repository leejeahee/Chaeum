// App State
let points = 1708;

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
  closeBottomSheet();
  switchTab('camera');
}

// Camera & Mission Logic
function takePhoto() {
  const loading = document.getElementById('loading-modal');
  const success = document.getElementById('success-modal');
  
  loading.classList.remove('hidden');
  
  // 2초 딜레이 시뮬레이션
  setTimeout(() => {
    loading.classList.add('hidden');
    success.classList.remove('hidden');
    
    // 포인트 증가
    points += 50;
    document.getElementById('user-points').innerText = points.toLocaleString();
  }, 2000);
}

function goToUpload() {
  document.getElementById('success-modal').classList.add('hidden');
  switchTab('upload');
}

function saveImage() {
  alert('갤러리에 이미지가 저장되었습니다! (프리뷰 기능)');
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

function renderCharacter(containerSelector, pixelSize = '12px') {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  
  container.innerHTML = '';
  // Fixed size based on matrix dimensions (16x16)
  container.style.gridTemplateColumns = `repeat(16, ${pixelSize})`;
  container.style.gridTemplateRows = `repeat(16, ${pixelSize})`;

  charDesign.forEach(row => {
    row.forEach(val => {
      const px = document.createElement('div');
      px.style.width = pixelSize;
      px.style.height = pixelSize;
      px.style.backgroundColor = colors[val];
      container.appendChild(px);
    });
  });
}

// Initialize Characters
window.onload = () => {
  renderCharacter('.pixel-character', '14px'); // Bigger for Home screen
  renderCharacter('.pixel-character-overlay', '8px'); // Smaller for overlay
  renderCharacter('#pixel-char-large', '14px'); // Archero style screen
  switchTab('home'); // Init state
};
