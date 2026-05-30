# 채움 앱 워크플로우 — 개선판

> [!IMPORTANT]
> 원본 대비 추가된 항목: **GNB 라우팅 흐름**, **에러/예외 처리 분기**, **API 파라미터 명세**, **지도 핀 필터 로직**, **localStorage 상태 유지 흐름**

---

## 전체 아키텍처 흐름

```mermaid
flowchart TD
    %% ─────────────────────────────────────────
    %% APP ENTRY
    %% ─────────────────────────────────────────
    START([앱 시작]) --> LOAD_STATE["localStorage.loadState()\n points · equippedSlots\n equippedTitle · appMode"]
    LOAD_STATE --> HOME

    %% ─────────────────────────────────────────
    %% GNB (Global Navigation Bar) — 탭 전환
    %% ─────────────────────────────────────────
    subgraph GNB["🔻 하단 GNB — 탭 전환 (State 유지, 새로고침 없음)"]
        direction LR
        TAB_HOME["🏠 홈"]
        TAB_MAP["🗺️ 지도"]
        TAB_CAM["📷 카메라"]
        TAB_UPLOAD["⬆️ 업로드"]
        TAB_PROFILE["👤 마이"]
    end

    HOME <-->|switchTab| TAB_HOME
    MAP_SCREEN <-->|switchTab| TAB_MAP
    CAM_SCREEN <-->|switchTab| TAB_CAM
    UPLOAD_SCREEN <-->|switchTab| TAB_UPLOAD
    PROFILE_SCREEN <-->|switchTab| TAB_PROFILE

    %% ─────────────────────────────────────────
    %% HOME SCREEN
    %% ─────────────────────────────────────────
    subgraph HOME["🏠 홈 화면"]
        direction TB
        MODE_TOGGLE{"appMode?\n solo / couple"}
        SOLO_VIEW["솔로 뷰\n '나의 오늘의 발견'\n 내 캐릭터만 렌더"]
        COUPLE_VIEW["커플 뷰\n '성수동 정복 커플'\n 내 캐릭터 + 파트너"]
        MY_CHAR_CLICK["내 캐릭터 클릭\n(파트너는 pointer-events:none)"]
    end

    LOAD_STATE --> MODE_TOGGLE
    MODE_TOGGLE -->|solo| SOLO_VIEW
    MODE_TOGGLE -->|couple| COUPLE_VIEW
    MY_CHAR_CLICK --> CUSTOM_SCREEN

    %% ─────────────────────────────────────────
    %% MAP SCREEN
    %% ─────────────────────────────────────────
    subgraph MAP_SCREEN["🗺️ 지도 화면"]
        direction TB
        MAP_FILTER["핀 필터 버튼\n[전체] [미션] [카페] [식당] [소품샵] [히든]"]
        MAP_FILTER -->|카테고리 선택| FILTER_LOGIC["필터 적용\ncurrentFilter = category\n해당 카테고리 핀만 표시\n나머지 핀 opacity:0.3"]
        FILTER_LOGIC --> MAP_PINS["지도 핀 렌더링\n marker-1/2/3 ..."]
        MAP_PINS -->|핀 클릭| BOTTOM_SHEET["바텀 시트 팝업\nplaceName · desc\n[인증 미션 시작하기] 버튼"]
    end

    BOTTOM_SHEET -->|"[인증 미션 시작하기] 클릭\nisMissionActive = true"| CAM_SCREEN

    %% ─────────────────────────────────────────
    %% CAMERA SCREEN
    %% ─────────────────────────────────────────
    subgraph CAM_SCREEN["📷 카메라 화면"]
        direction TB
        CAM_PERM{"카메라 권한\n허용됨?"}
        CAM_GRANTED["카메라 활성화\ngetUserMedia()"]
        CAM_DENIED["❌ 권한 거부\n토스트: '설정에서\n카메라 권한을 허용해 주세요'"]
        CAM_TAKE["셔터 버튼 클릭\ntakePhoto()\nlatestPhotoUrl 저장"]
        CAM_MISSION{"isMissionActive\n=== true?"}
    end

    CAM_PERM -->|yes| CAM_GRANTED
    CAM_PERM -->|no| CAM_DENIED
    CAM_DENIED --> CAM_PERM
    CAM_GRANTED --> CAM_TAKE
    CAM_TAKE --> CAM_MISSION
    CAM_MISSION -->|"true\n미션 사진"| COMPLETE_MISSION
    CAM_MISSION -->|"false\n일반 촬영"| SIMPLE_SAVE["alert('사진이 임시 저장되었습니다.')\nisMissionActive 유지 false"]

    %% ─────────────────────────────────────────
    %% MISSION COMPLETE FLOW
    %% ─────────────────────────────────────────
    subgraph COMPLETE_MISSION["✅ 미션 인증 플로우"]
        direction TB
        LOADING_MODAL["로딩 모달 표시\n'AI 검증 중...' 2초"]
        API_VERIFY{"API 응답\n성공?"}
        SUCCESS_MODAL["🎉 성공 모달\n+50 포인트 지급\npoints += 50\nsaveState()"]
        API_ERROR["❌ 에러 팝업\n'인증에 실패했습니다.\n다시 시도해 주세요.'\nisMissionActive = true 유지"]
        API_TIMEOUT["⏱️ 타임아웃(5초 초과)\n'서버 응답이 없습니다.\n네트워크를 확인해 주세요.'"]
        RESET_MISSION["isMissionActive = false"]
    end

    LOADING_MODAL --> API_VERIFY
    API_VERIFY -->|"200 OK"| SUCCESS_MODAL
    API_VERIFY -->|"4xx / 5xx"| API_ERROR
    API_VERIFY -->|"timeout"| API_TIMEOUT
    API_ERROR -->|재시도| CAM_SCREEN
    API_TIMEOUT -->|재시도| CAM_SCREEN
    SUCCESS_MODAL --> RESET_MISSION
    RESET_MISSION --> UPLOAD_SCREEN

    %% ─────────────────────────────────────────
    %% UPLOAD SCREEN
    %% ─────────────────────────────────────────
    subgraph UPLOAD_SCREEN["⬆️ 업로드 / 합성 화면"]
        direction TB
        COMPOSITE_VIEW["composite-view 렌더\n배경: latestPhotoUrl\n전경: 픽셀 캐릭터 오버레이"]
        SAVE_BTN["[저장하기] 버튼\nhtml2canvas 캡처"]
        CAPTURE_FLOW{"캡처 성공?"}
        DL_SUCCESS["PNG 다운로드\nchaeum_meme_타임스탬프.png\n포토로그에 추가"]
        DL_ERROR["❌ 에러 토스트\n'저장에 실패했습니다.'"]
    end

    COMPOSITE_VIEW --> SAVE_BTN
    SAVE_BTN --> CAPTURE_FLOW
    CAPTURE_FLOW -->|yes| DL_SUCCESS
    CAPTURE_FLOW -->|no| DL_ERROR
    DL_SUCCESS --> PHOTOLOG_UPDATE["포토로그 갱신\nphotologData[] 업데이트"]

    %% ─────────────────────────────────────────
    %% CUSTOMIZATION SCREEN
    %% ─────────────────────────────────────────
    subgraph CUSTOM_SCREEN["👗 캐릭터 커스터마이징"]
        direction TB
        CUSTOM_TABS{"하단 탭 선택"}
        TAB_ITEM["아이템 탭\n인벤토리 4열 그리드\n장착 → equip-slot 채움\n탈착 → 슬롯 비움\nequippedSlots 저장"]
        TAB_TITLE["칭호 탭\n배지 리스트 뷰\n달성됨(achieved) / 잠금(locked)\n클릭 → toggleTitle()\nequippedTitle 저장"]
        TAB_PHOTOLOG["포토로그 탭\n3열 그리드\n클릭 → 확대 모달"]
        OVERLAY_RENDER["캐릭터 오버레이 렌더\nitemData[emoji] → 부위 결정\noverlay-head/hand/feet 절대좌표"]
    end

    TAB_ITEM --> OVERLAY_RENDER
    CUSTOM_TABS -->|아이템| TAB_ITEM
    CUSTOM_TABS -->|칭호| TAB_TITLE
    CUSTOM_TABS -->|포토로그| TAB_PHOTOLOG

    %% ─────────────────────────────────────────
    %% PROFILE SCREEN
    %% ─────────────────────────────────────────
    subgraph PROFILE_SCREEN["👤 마이페이지"]
        direction TB
        PROFILE_INFO["유저 프로필\n닉네임 · 포인트 배지\n방문 장소 수 · 획득 칭호"]
        PROFILE_EDIT["프로필 편집\n(닉네임 변경 등)"]
        LOGOUT["로그아웃\nlocalStorage.clear()"]
    end
```

---

## API 명세 (핵심 파라미터)

```mermaid
sequenceDiagram
    participant APP as 앱 (Frontend)
    participant API as 채움 API (Backend)
    participant DB as Supabase DB

    Note over APP,DB: 미션 인증 플로우

    APP->>API: POST /api/missions/verify
    Note right of APP: Body: {<br/>  userId: "uuid",<br/>  missionId: "mission_001",<br/>  photoUrl: "data:image/png;base64,...",<br/>  locationLat: 37.5665,<br/>  locationLng: 126.9780,<br/>  timestamp: "2026-05-28T13:00:00Z"<br/>}

    API-->>APP: 200 OK
    Note left of API: Response: {<br/>  success: true,<br/>  pointsEarned: 50,<br/>  totalPoints: 1758,<br/>  missionStatus: "completed"<br/>}

    API->>DB: INSERT missions_log(userId, missionId, photoUrl, verifiedAt)
    API->>DB: UPDATE users SET points = points + 50

    APP->>API: POST /api/photos/upload
    Note right of APP: Body: {<br/>  userId: "uuid",<br/>  imageData: "base64...",<br/>  missionId: "mission_001",<br/>  compositeType: "chill_guy"<br/>}

    API-->>APP: 200 OK
    Note left of API: Response: {<br/>  photoId: "photo_uuid",<br/>  storedUrl: "https://cdn.chaeum.app/...",<br/>  createdAt: "2026-05-28T13:05:00Z"<br/>}
```

---

## 보완된 주요 항목 요약

| 구분 | 원본 문제 | 개선 내용 |
|------|-----------|-----------|
| **1. GNB 라우팅** | 화면 간 연결 화살표 없음 | 모든 탭에서 `switchTab()` 양방향 화살표 추가, 상태(State) 유지 명시 |
| **2. 예외 처리** | 해피패스만 존재 | 카메라 권한 거부, API 오류(4xx/5xx), 타임아웃, 캡처 실패 → 각 Fallback UI 분기 추가 |
| **3. API 파라미터** | 추상적 텍스트만 존재 | Sequence Diagram으로 Request/Response body 필드 전체 명세화 |
| **4. 빈 타원 노드** | 5개 미완성 타원 | 핀 카테고리 필터(전체/미션/카페/식당/소품샵/히든) 로직으로 구체화 |
| **5. 로컬스토리지** | 언급 없음 | 앱 시작 시 `loadState()` 흐름 명시 |
| **6. 아이템 오버레이** | 언급 없음 | `itemData` → 부위 분류 → 절대좌표 렌더링 흐름 추가 |
| **7. 칭호 시스템** | 언급 없음 | `toggleTitle()` 탈부착 분기, `equippedTitle` 저장 흐름 추가 |
