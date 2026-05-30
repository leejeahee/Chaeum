-- =======================================================
-- Chaeum MVP: DB 스키마 전체 설정
-- Supabase SQL Editor에 복붙 후 Run 클릭
-- =======================================================

-- ── 1. users 테이블 ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  points      INTEGER     NOT NULL DEFAULT 0,
  items       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  title       TEXT        NOT NULL DEFAULT '초보 탐험가',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: anon insert"  ON public.users FOR INSERT  WITH CHECK (true);
CREATE POLICY "users: anon select"  ON public.users FOR SELECT  USING (true);
CREATE POLICY "users: anon update"  ON public.users FOR UPDATE  USING (true);

-- ── 2. crews 테이블 (프라이빗 크루/그룹) ─────────────
CREATE TABLE IF NOT EXISTS public.crews (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL DEFAULT '새 지도',
  invite_code  TEXT        NOT NULL UNIQUE,  -- 6자리 영숫자 랜덤 코드
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crews: anon insert"  ON public.crews FOR INSERT  WITH CHECK (true);
CREATE POLICY "crews: anon select"  ON public.crews FOR SELECT  USING (true);

-- ── 3. spots 테이블 (지도 위 핀 장소) ────────────────
--   type: 'official' → 공식 핫플(모두에게 공통으로 보임)
--         'user'     → 특정 크루가 추가한 핀
--   crew_id: NULL이면 official 장소
CREATE TABLE IF NOT EXISTS public.spots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id     UUID        REFERENCES public.crews(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'official' CHECK (type IN ('official', 'user')),
  emoji       TEXT        NOT NULL DEFAULT '📍',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spots: anon insert"  ON public.spots FOR INSERT  WITH CHECK (true);
CREATE POLICY "spots: anon select"  ON public.spots FOR SELECT  USING (true);

-- ── 4. 분당 정자역 근처 공식 핫플 3개 INSERT ─────────
--   (type: 'official', crew_id: NULL → 모든 크루 공통)
INSERT INTO public.spots (name, lat, lng, type, emoji) VALUES
  ('정자 로스터리 카페',    37.3610, 127.1121, 'official', '☕'),
  ('정자 파스타 맛집',      37.3598, 127.1135, 'official', '🍝'),
  ('정자 한강뷰 디저트카페', 37.3625, 127.1098, 'official', '🍰');

-- ── 5. stamps 테이블 (다크소울 방명록 / 점령 시스템) ──
--   동일 spot_id에 여러 기록이 쌓이며, 가장 최근 created_at이 '현재 점령자'
CREATE TABLE IF NOT EXISTS public.stamps (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id      UUID        NOT NULL REFERENCES public.spots(id) ON DELETE CASCADE,
  user_uuid    TEXT        NOT NULL,   -- device UUID (익명 식별자)
  user_color   TEXT        NOT NULL DEFAULT '#ff3478',  -- 유저 고유 색상 (hex)
  message      TEXT        NOT NULL,   -- 조합형 메시지 (예: "이 앞 JMT 미쳤다")
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stamps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stamps: anon insert" ON public.stamps FOR INSERT WITH CHECK (true);
CREATE POLICY "stamps: anon select" ON public.stamps FOR SELECT USING (true);

-- 최신 점령자 조회용 인덱스 (spot_id + created_at DESC)
CREATE INDEX IF NOT EXISTS idx_stamps_spot_latest
  ON public.stamps (spot_id, created_at DESC);
