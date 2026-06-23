# Supabase 마이그레이션 (DB as code)

DB 스키마 변경을 코드/깃으로 관리합니다. 변경은 `migrations/`에 SQL 파일로 쌓이고,
`supabase db push`로 원격 DB에 순서대로 적용됩니다.

## 최초 1회 설정 (각자 로컬에서)
1. CLI 준비 — `npx supabase --version` (또는 `winget install Supabase.CLI`)
2. 로그인 — `npx supabase login` (대시보드 Account → Access Tokens에서 토큰 발급)
3. 프로젝트 연결 — `npx supabase link --project-ref jwivrbqmzzgjmoewoblx` (DB 비밀번호 입력)

## 마이그레이션 적용
```
npx supabase db push
```
원격 DB에 아직 반영되지 않은 `migrations/*.sql`만 골라 순서대로 실행합니다.

## 새 변경을 추가할 때
```
npx supabase migration new <이름>
# 생성된 파일에 ALTER/CREATE 작성
npx supabase db push
```
추가로 팀 복붙용 전체 스키마인 `preview/supabase_setup.sql`도 함께 갱신하세요.

> ⚠️ Access Token과 DB 비밀번호는 시크릿입니다. 절대 깃에 커밋하지 마세요.
> (`supabase/.gitignore`가 `.env*`, `.branches`, `.temp`를 이미 제외합니다.)
