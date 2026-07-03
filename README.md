# 오일나라 고객등록 이벤트 페이지

QR로 접속하는 고객용 링크 페이지와 관리자 페이지입니다.

## 실행

```powershell
npm install
npm start
```

- 고객 화면: `http://localhost:4173/`
- 관리자 화면: `http://localhost:4173/admin`
- 기본 관리자 비밀번호: `oilnara2026!`

운영 환경에서는 반드시 환경변수로 관리자 비밀번호와 세션 키를 지정하세요.

```powershell
$env:ADMIN_PASSWORD="새 비밀번호"
$env:SESSION_SECRET="긴 랜덤 문자열"
npm start
```

## 주요 기능

- 고객용 링크 5개 관리
- 링크 순서 변경
- 링크별 로고 이미지 업로드
- 고객 화면 다크/화이트 모드
- 관리자 화면 다크/화이트 모드
- 클릭 수 집계
- QR SVG/EPS 생성

## 배포 메모

로컬에서는 `data/site.json`, `data/stats.json` 파일에 관리자 설정과 클릭 통계를 저장합니다.

Vercel 운영 배포에서는 Supabase 환경변수를 넣으면 같은 데이터가 Supabase에 저장됩니다.

1. Supabase SQL Editor에서 `supabase/schema.sql` 실행
2. Vercel 환경변수 등록
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_TABLE=oilnara_event_store`
3. Vercel에서 GitHub 저장소 연결
4. 도메인 `event.oilnara.com` 연결

QR 인쇄용 파일은 배포 완료 후 `https://event.oilnara.com/qr.svg`, `https://event.oilnara.com/qr.eps`에서 내려받으세요.
