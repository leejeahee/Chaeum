-- 어드민 "공식 위치 추가" 기능용 메타 컬럼 추가
-- 기존 DB에도 안전하게 적용됨 (ADD COLUMN IF NOT EXISTS → 멱등)
alter table public.spots add column if not exists category text;  -- 카페 / 식당 / 기타
alter table public.spots add column if not exists address  text;  -- 도로명/지번 주소
