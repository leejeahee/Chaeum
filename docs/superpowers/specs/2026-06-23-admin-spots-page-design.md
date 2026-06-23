# 어드민 페이지 (공식 위치 추가) — 설계

- 작성일: 2026-06-23
- 브랜치: `feature/admin-spots-page`
- 상태: 설계 확정 대기

## 1. 개요 / 목적

운영자가 카카오 지도 위에서 **공식 핫플(official spot)** 을 손쉽게 추가하는 독립 어드민 페이지를 만든다.
현재 `spots`는 SQL 시드로만 3건 들어가 있고 위치를 추가하는 UI가 없다. 이 페이지로 운영자가 직접 위치를 등록한다.

## 2. 목표 / 비목표

**목표**
- 지도 클릭으로 좌표를 자동 입력(수동 편집도 가능)
- 상호명·카테고리·이모지·주소 등 메타 정보 입력
- `spots`에 `type='official'`, `crew_id=null`로 저장
- 방금 추가한 장소를 화면에서 바로 확인(최근 추가 목록)

**비목표 (이번 범위 제외, 향후)**
- 인증/권한 게이트 (편의상 완전 오픈)
- 장소 수정·삭제 기능
- 설명·영업시간 등 추가 메타데이터 (지금은 미포함, 추후 컬럼 추가)
- 카테고리 확장 (지금은 카페/식당/기타 3종만)
- 크루(user) 타입 위치 추가

## 3. 접근 방식

**독립 페이지(A안)**: 사용자 앱(`index.html`)과 분리된 `admin.html`을 운영자가 직접 연다.
자체 카카오 지도 + 폼을 가지며 `supabase_init.js`를 재사용한다. 사용자 앱 코드는 건드리지 않는다.

## 4. 파일 구성 (`preview/` 신규)

| 파일 | 역할 |
|------|------|
| `admin.html` | 레이아웃: 좌측 카카오 지도, 우측 입력 폼 + 최근 추가 목록 |
| `admin.js` | 지도 클릭 핸들러, 폼 검증·제출(spots INSERT), 최근 목록 로드/갱신 |
| `admin.css` | 어드민 전용 스타일 (기존 `style.css` 미변경) |

기존 `index.html` / `script.js` / `style.css`는 변경하지 않는다.

## 5. DB 스키마 변경 (`supabase_setup.sql`에 추가)

```sql
ALTER TABLE public.spots ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.spots ADD COLUMN IF NOT EXISTS address  TEXT;
```

- 둘 다 nullable → 기존 INSERT(`script.js`의 점령/시드)와 호환, 기존 행 영향 없음.
- `fetchSpots`/`buildStampHTML`는 새 컬럼을 무시하므로 사용자 앱 수정 불필요.
- 운영 DB에는 위 ALTER 문을 Supabase SQL Editor에서 1회 실행해야 한다(문서에 명시).

## 6. 화면 / 동작

### 6.1 레이아웃
- 좌측: 카카오 지도(정자역 `37.3610, 127.1121` 중심, level 4)
- 우측: 입력 폼 + "최근 추가된 장소" 목록

### 6.2 지도 상호작용
- 지도 클릭 → 단일 마커를 클릭 위치로 이동 + 위도/경도 입력 필드 자동 채움
- 위도/경도 필드는 수동 편집 가능. 필드 `change` 시 마커 위치와 지도 중심을 해당 좌표로 이동시켜 동기화

### 6.3 폼 필드
| 필드 | 필수 | 입력 형태 | 비고 |
|------|------|-----------|------|
| 상호명 (name) | ✅ | 텍스트 | 빈 값 불가 |
| 위도 (lat) | ✅ | 숫자 | 지도 클릭 자동입력, 편집 가능 |
| 경도 (lng) | ✅ | 숫자 | 지도 클릭 자동입력, 편집 가능 |
| 카테고리 (category) | — | 드롭다운 | 카페 / 식당 / 기타 |
| 이모지 (emoji) | — | 텍스트 | 카테고리 선택 시 기본값 제안(카페☕/식당🍽️/기타📍), 편집 가능 |
| 주소 (address) | — | 텍스트 | 자유 입력 |

### 6.4 제출 흐름
1. 검증: 상호명 비어있지 않음 + lat/lng가 유효한 숫자. 실패 시 인라인 에러.
2. `spots`에 INSERT: `{ name, lat, lng, type:'official', crew_id:null, emoji, category, address }`
   - emoji 미입력 시 카테고리 기본 이모지 또는 `📍` 사용.
3. 성공 → 토스트("추가 완료") + 폼 초기화(지도 중심/마커는 유지) + 최근 목록 맨 위에 추가.
4. 실패 → 에러 토스트 + 폼 값 유지.

### 6.5 최근 추가된 장소 목록
- 진입 시 `spots`에서 `type='official'` 최신순으로 10개 조회해 표시.
- 항목: 이모지 · 상호명 · 카테고리 · (lat, lng).
- 읽기 전용(이번 범위에 삭제 없음). 기존 `spots: anon select` 정책으로 조회 가능.

## 7. Supabase 미설정 처리

- `admin.js`는 `window._supabaseReady` / `window._supabaseClient`로 설정 여부 확인.
- 미설정 시: 상단에 "Supabase 설정 필요 — 저장이 비활성화됩니다" 경고 배너 표시, 제출 버튼 비활성화(또는 제출 시 차단).
- 지도 클릭/폼 입력 UI 자체는 동작하여 화면 확인은 가능.

## 8. 에러 / 예외

- 카카오 SDK 미로드(예: file://로 열람): 지도 영역에 안내 메시지 + 콘솔 경고. (참고: `index.html`이 쓰는 `//dapi.kakao.com` 프로토콜 상대 URL은 file://에서 깨지므로, `admin.html`은 `https://dapi.kakao.com` + `autoload=false` + `kakao.maps.load()` 패턴으로 작성한다.)
- INSERT 실패(네트워크/권한): 에러 토스트, 폼 값 보존.
- 필수값 누락: 인라인 검증 메시지.

## 9. 검증 방법

- 로컬 http 서버로 `admin.html`을 열어 확인(`file://` 아님).
- 지도 클릭 → lat/lng 자동 채움 확인.
- (Supabase 설정 시) 저장 → Supabase 테이블에 행 생성 + 최근 목록 반영 확인.
- 사용자 앱(`index.html`) 재진입 시 새로 추가한 official 스팟이 지도에 렌더되는지 확인.

## 10. 향후 확장 (참고)

- 설명/영업시간 등 메타 컬럼 추가
- 카테고리 확대, 카테고리별 필터
- 수정/삭제(삭제 시 `spots` delete RLS 정책 필요)
- 접근 보호(인증)
