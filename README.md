# Firebase Web (1단계)

이 폴더는 학생실습관리 프로젝트의 Firebase 전환 1단계 결과물입니다.

구현 범위
- React + Vite 프론트엔드 생성
- Firebase SDK 연동
- Google 로그인
- 관리자 1인 이메일 제한
- 비관리자 계정 자동 로그아웃

## 1. 환경 변수 설정

1) `.env.example`을 참고해서 `.env` 파일을 생성합니다.
2) 필요한 값을 입력합니다.

필수 키
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_ADMIN_EMAIL`

기본 관리자 이메일은 `goodojb@gmail.com` 입니다.

## 2. 실행

```bash
npm install
npm run dev
```

브라우저에서 개발 서버 주소를 열고 Google 로그인 후 관리자 계정만 접근 가능한지 확인합니다.

## 3. 빌드

```bash
npm run build
npm run preview
```

## 현재 제외 범위
- 프라이버시 모드
- AI 코치
- Gemini AI

위 기능은 이번 스프린트 범위에서 제외되어 있습니다.
