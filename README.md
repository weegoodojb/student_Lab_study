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
- `VITE_GEMINI_API_KEY` (주차별 퀴즈 서술형 자동채점용, 선택)

기본 관리자 이메일은 `goodojb@gmail.com` 입니다.

Firestore 보안 규칙 배포, Google Forms API 활성화, Gemini API 키 리퍼러 제한 등 1회성 설정은
`FIRESTORE_DEPLOYMENT.md`를 참고하세요.

## 2. 실행

```bash
npm install
npm run dev
```

개발 서버도 실제 클라우드 Firestore(`student-practice-mgmt`)에 바로 연결됩니다. 관리자 1인이
사용하는 소규모 도구라 별도 로컬 에뮬레이터는 두지 않았습니다. 테스트 데이터가 쌓이면 아래처럼
Firebase CLI로 언제든 전체 초기화할 수 있습니다.

```bash
npx firebase login   # 최초 1회
npx firebase firestore:delete --all-collections --force --project student-practice-mgmt
```

브라우저에서 개발 서버 주소를 열고 Google 로그인 후 관리자 계정만 접근 가능한지 확인합니다.

## 3. 빌드

```bash
npm run build
npm run preview
```

## 현재 제외 범위
- 프라이버시 모드
- 출석/중간/기말 성적의 엑셀(또는 시트) 업로드 — 형식 확정 전까지 "성적 관리" 탭은 자리만 마련된 상태

## 학기별 히스토리
모든 학생/점수/조편성/퀴즈 데이터는 `terms/{year}-{semester}` 아래로 스코프됩니다. 학기가 바뀌면
관리자 대시보드 상단에서 새 학기를 만들고 학생을 새로 업로드하면 되고, 과거 학기 데이터는
그대로 남아 있습니다. 자세한 구조는 `FIRESTORE_SCHEMA.md` 참고.
