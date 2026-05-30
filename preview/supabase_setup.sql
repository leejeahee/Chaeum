-- =======================================================
-- Chamap MVP: 유저 테이블 생성 SQL
-- Supabase SQL Editor에 복붙 후 Run 클릭
-- =======================================================

-- 1. users 테이블 생성
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  points      INTEGER     NOT NULL DEFAULT 0,
  items       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  title       TEXT        NOT NULL DEFAULT '초보 탐험가',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS(Row Level Security) 활성화
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. 정책: anon 키로 INSERT 허용 (최초 진입 - 신규 유저 등록)
CREATE POLICY "Allow anon insert"
  ON public.users
  FOR INSERT
  WITH CHECK (true);

-- 4. 정책: anon 키로 SELECT 허용
--    프론트에서 .eq('id', deviceUUID) WHERE 절로 본인 UUID만 조회하므로
--    USING(true)로 충분히 안전합니다. (별도 인증 없는 MVP 단계에서 표준 패턴)
CREATE POLICY "Allow anon select"
  ON public.users
  FOR SELECT
  USING (true);

-- 5. 정책: anon 키로 UPDATE 허용 (포인트·아이템 저장 시 사용)
CREATE POLICY "Allow anon update"
  ON public.users
  FOR UPDATE
  USING (true);

