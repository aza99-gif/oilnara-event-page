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

현재 버전은 `data/site.json`, `data/stats.json` 파일에 관리자 설정과 클릭 통계를 저장합니다. Vercel 같은 서버리스 환경에서는 파일 저장이 영구 보장되지 않을 수 있으므로, 운영 배포 시 Supabase 같은 외부 DB 저장소 연결을 권장합니다.
