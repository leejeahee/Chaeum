# 채움 앱 전체 아키텍처 및 API 명세 워크플로우

> 🚨 **크리티컬 블로커 개선판**: 초기 진입 Auth(UUID 동기화), 파트너 데이터 Polling, 미션 50m GPS 반경 검증, 포토로그 영속성(GET 호출) 로직이 추가되었습니다.

---

## 1. 전체 아키텍처 흐름

```mermaid
flowchart TD
    %% ─────────────────────────────────────────
    %% APP ENTRY (Auth & Sync)
    %% ─────────────────────────────────────────
    START([앱 시작]) --> CHECK_UUID{"Device UUID\n존재 여부\n(localStorage)"}
    CHECK_UUID -->|"No (최초 실행)"| POST_INIT["POST /api/users/init\n(익명 UUID 발급 & DB 생성)"]
    POST_INIT --> SET_UUID["localStorage에 UUID 저장"]
    SET_UUID --> GET_ME
    CHECK_UUID -->|"Yes (기존 유저)"| GET_ME["GET /api/users/me\nDB에서 상태값 동기화\n(points, items, title)"]
    GET_ME --> HOME

    %% ─────────────────────────────────────────
    %% GNB (Global Navigation Bar)
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
        MODE_TOGGLE{"appMode?\n adventure / planning"}
        SOLO_VIEW["모험 모드 (솔로/즉흥)\n내 캐릭터만 렌더링"]
        COUPLE_VIEW["노변수 모드 (커플/계획)\nGET /api/couples/{id}\n(진입 시 파트너 정보 Polling)"]
        MY_CHAR_CLICK["내 캐릭터 클릭\n(커스텀 화면 이동)"]
    end

    GET_ME --> MODE_TOGGLE
    MODE_TOGGLE -->|adventure| SOLO_VIEW
    MODE_TOGGLE -->|planning| COUPLE_VIEW
    MY_CHAR_CLICK --> CUSTOM_SCREEN

    %% ─────────────────────────────────────────
    %% MAP SCREEN
    %% ─────────────────────────────────────────
    subgraph MAP_SCREEN["🗺️ 지도 화면 (동선 설계)"]
        direction TB
        N_CHOICE_UI["하단 N지선다 카드 스와이프"]
        N_CHOICE_UI -->|장소 선택| DRAW_PIN["지도 위에 핀 렌더링\n(updateMapPins)"]
        DRAW_PIN --> NEXT_STEP["다음 Step 카드 호출"]
        NEXT_STEP -->|모든 Step 완료| CAM_BTN["[인증 미션 시작하기] 버튼"]
    end

    CAM_BTN -->|"isMissionActive = true"| CAM_SCREEN

    %% ─────────────────────────────────────────
    %% CAMERA SCREEN
    %% ─────────────────────────────────────────
    subgraph CAM_SCREEN["📷 카메라 화면"]
        direction TB
        CAM_PERM{"카메라 권한?"}
        CAM_GRANTED["카메라 활성화 (getUserMedia)"]
        CAM_DENIED["❌ 권한 거부\n토스트: '권한을 허용해 주세요'"]
        CAM_TAKE["사진 촬영 (takePhoto)"]
    end

    CAM_PERM -->|yes| CAM_GRANTED
    CAM_PERM -->|no| CAM_DENIED
    CAM_GRANTED --> CAM_TAKE
    CAM_TAKE --> COMPLETE_MISSION

    %% ─────────────────────────────────────────
    %% MISSION COMPLETE FLOW
    %% ─────────────────────────────────────────
    subgraph COMPLETE_MISSION["✅ 미션 인증 플로우 (GPS 검증)"]
        direction TB
        LOADING_MODAL["'위치 및 사진 검증 중...'"]
        API_VERIFY{"POST /api/missions/verify\nGPS 좌표 < 50m 이내인가?"}
        SUCCESS_MODAL["🎉 성공 모달\n포인트 지급 & DB 업데이트"]
        API_ERROR["❌ 실패: '거리가 너무 멉니다'\n또는 서버 에러"]
    end

    LOADING_MODAL --> API_VERIFY
    API_VERIFY -->|"거리 OK (200)"| SUCCESS_MODAL
    API_VERIFY -->|"거리 밖 / 에러 (4xx)"| API_ERROR
    API_ERROR -->|재시도| CAM_SCREEN
    SUCCESS_MODAL --> UPLOAD_SCREEN

    %% ─────────────────────────────────────────
    %% UPLOAD SCREEN
    %% ─────────────────────────────────────────
    subgraph UPLOAD_SCREEN["⬆️ 합성 및 포토로그 저장"]
        direction TB
        COMPOSITE_VIEW["배경 사진 + 캐릭터 렌더링"]
        SAVE_BTN["POST /api/photos/upload"]
        DL_SUCCESS["포토로그에 사진 URL 추가"]
    end

    COMPOSITE_VIEW --> SAVE_BTN
    SAVE_BTN --> DL_SUCCESS

    %% ─────────────────────────────────────────
    %% CUSTOMIZATION SCREEN
    %% ─────────────────────────────────────────
    subgraph CUSTOM_SCREEN["👗 캐릭터 커스터마이징"]
        direction TB
        CUSTOM_TABS{"하단 탭 선택"}
        TAB_ITEM["아이템 탭 (장착/탈착)"]
        TAB_TITLE["칭호 탭 (선택 시 뱃지 변경)"]
        TAB_PHOTOLOG["포토로그 탭\nGET /api/photos\nDB에서 사진 리스트 패치"]
    end

    CUSTOM_TABS -->|아이템| TAB_ITEM
    CUSTOM_TABS -->|칭호| TAB_TITLE
    CUSTOM_TABS -->|포토로그| TAB_PHOTOLOG

    %% ─────────────────────────────────────────
    %% PROFILE SCREEN
    %% ─────────────────────────────────────────
    subgraph PROFILE_SCREEN["👤 마이페이지"]
        direction TB
        PROFILE_INFO["유저 프로필 및 스탯"]
        LOGOUT["로그아웃\nlocalStorage.clear()"]
    end
```

---

## 2. 세부 API 명세 (Sequence Diagram)

```mermaid
sequenceDiagram
    participant APP as 앱 (Frontend)
    participant API as 채움 API (Backend)
    participant DB as Supabase DB

    Note over APP,DB: 1. 초기 진입 및 데이터 동기화 (Auth)
    APP->>API: GET /api/users/me (Header: Device-UUID)
    API-->>APP: 200 OK { points: 1708, items: {...}, title: "분당 탐험가" }

    Note over APP,DB: 2. 커플 모드 파트너 상태 Polling
    APP->>API: GET /api/couples/{coupleId}
    API-->>APP: 200 OK { partnerName: "상대방", partnerItems: {...} }

    Note over APP,DB: 3. 미션 인증 및 GPS 어뷰징 방어
    APP->>API: POST /api/missions/verify
    Note right of APP: Body: {<br/>  userId: "uuid",<br/>  missionId: "theme_jeongja_step1",<br/>  locationLat: 37.3670,<br/>  locationLng: 127.1054<br/>}
    Note over API: [비즈니스 로직]<br/>DB의 목표지점 좌표와 유저 좌표 간<br/>직선 거리 계산 (Haversine formula)<br/>거리 < 50m 일 경우에만 성공 처리
    API->>DB: INSERT missions_log (success)
    API->>DB: UPDATE users SET points = points + 50
    API-->>APP: 200 OK { success: true, pointsEarned: 50 }

    Note over APP,DB: 4. 포토로그 업로드 및 조회 (영속성)
    APP->>API: POST /api/photos/upload
    Note right of APP: Body: { userId, imageData(base64) }
    API->>DB: INSERT photos(url, userId, createdAt)
    API-->>APP: 200 OK { storedUrl: "https://..." }

    APP->>API: GET /api/photos?userId={uuid}
    Note right of APP: 포토로그 탭 진입 시 호출
    API-->>APP: 200 OK { photos: [ {id, url, createdAt} ... ] }
```
