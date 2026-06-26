# 학생 실습 관리 시스템 - 3단계 완료 (Firebase + React)

## 📊 프로젝트 개요
- **기간**: 3-stage 순차 구현
- **상태**: ✅ Stage 1 (Firestore 스키마) + Stage 2 (학생 조회) + Stage 3 (관리자 대시보드) **완료**
- **기술 스택**: React 19 + Vite + Firebase SDK 12 + Firestore

---

## 🎯 Stage 3 구현 사항

### 1. AdminDashboard 컴포넌트 (`src/pages/AdminDashboard.jsx`)
**학생 관리 탭**:
- 📤 학생 정보 업로드 (탭/쉼표 구분 텍스트 파싱)
- 📋 실시간 미리보기 (상위 20개 행)
- ❌ 파싱 에러 표시 (10개 샘플 + 개수)
- ✅ Firestore 배치 업로드 (setDoc merge mode)
- 🔍 검색 기능 (학번/이름)
- ✏️ 학생 수정 (모달 폼)
- 🗑️ 학생 삭제 (확인 다이얼로그)

**반 설정 탭**:
- 🎚️ 2/3 반 선택 (라디오 버튼)
- 💾 Firestore `settings/classFormation` 문서 저장
- ✏️ Upload 폼 검증에 적용 (class range 1-N 체크)

**Firestore 통합**:
- `getDocs()` + `limit(500)` → 학생 목록 로드
- `setDoc(..., { merge: true })` → 학생 추가/업데이트
- `updateDoc()` → 개별 필드 수정
- `deleteDoc()` → 학생 삭제
- Error handling with user-friendly messages

### 2. AdminDashboard 스타일링 (`src/pages/AdminDashboard.css`)
- 🎨 그린 테마 (#2f7a3e primary)
- 📱 반응형 디자인 (640px breakpoint)
- 🎯 테이블 + 폼 + 모달 컴포넌트
- ✨ 호버/활성 상태 애니메이션
- 📊 Upload 전/후 시각적 피드백

### 3. App.jsx 통합
- `AdminDashboard` import 추가
- Admin 모드에서 user 존재 시 대시보드 렌더링
- 로그인 게이트 유지 (goodojb@gmail.com만 접근)

### 4. 배포 가이드
- `FIRESTORE_DEPLOYMENT.md`: Firebase Console에서 보안 규칙 배포 방법
- Rules 복사 → Publish → 테스트 시나리오

---

## 📁 파일 구조 (최종 상태)

```
c:\code\학생실습관리\
├── Code.gs                           # GAS 백엔드 (기존 유지)
├── Index.html                        # GAS UI (기존 유지)
├── JavaScript.html                   # GAS 컨트롤러 (기존 유지)
├── GroupManagement.html              # GAS 그룹 관리 (기존)
├── Stylesheet.html                   # GAS 스타일 (기존)
│
└── firebase-web/
    ├── src/
    │   ├── App.jsx                   # ✅ 수정: AdminDashboard import + 렌더링
    │   ├── App.css                   # 모드 선택 버튼 스타일
    │   ├── index.css                 # 글로벌 스타일
    │   ├── firebase.js               # Firebase SDK 초기화 + db export
    │   ├── index.jsx                 # React 엔트리
    │   ├── pages/
    │   │   ├── StudentLookup.jsx      # 학생 조회 컴포넌트
    │   │   ├── StudentLookup.css
    │   │   ├── AdminDashboard.jsx     # ✨ 신규: 관리자 대시보드
    │   │   └── AdminDashboard.css     # ✨ 신규: 대시보드 스타일
    │   └── vite.config.js
    ├── dist/                         # 빌드 아티팩트 (39 modules)
    ├── public/
    ├── package.json
    ├── .env.example                  # Firebase 설정 템플릿
    ├── FIRESTORE_SCHEMA.md           # 스키마 문서 (5 collections)
    ├── FIRESTORE_SECURITY_RULES.txt  # 보안 규칙
    ├── FIRESTORE_DEPLOYMENT.md       # ✨ 신규: 배포 가이드
    └── README.md                     # 프로젝트 설정 가이드
```

---

## 🚀 사용 방법

### 개발 모드 실행
```bash
cd firebase-web
npm install          # 첫 설치 시만
npm run dev          # http://localhost:5173
```

### 관리자 모드 흐름
1. "👨‍💼 관리자" 버튼 클릭
2. "Google 로그인" → goodojb@gmail.com 선택
3. 인증 완료 → AdminDashboard 표시
4. "📚 학생 관리" 탭:
   - 텍스트 입력: `학번\t이름\t반\t교시\t조\t석차\t최종성적\t기본점수\t역할`
   - "✅ 업로드" → Firestore에 저장
5. "⚙️ 반 설정" 탭:
   - 2 또는 3개 반 선택
   - "✅ 저장"

### 학생 모드 흐름
1. "👤 학생" 버튼 클릭
2. 학번 입력 (예: S001)
3. "성적 조회" → Firestore 조회 + 표시
4. 자신의 데이터만 조회 가능 (보안 규칙 적용)

---

## 🔐 Firestore 보안 규칙

| 역할 | students | scoreRecords | examScores | settings | admins |
|------|----------|-------------|-----------|----------|--------|
| 관리자 (goodojb@gmail.com) | R/W/D | R/W/D | R/W/D | R/W/D | R/W/D |
| 학생 (인증) | R own | - | - | - | - |
| 미인증 | - | - | - | - | - |

배포 방법: `FIRESTORE_DEPLOYMENT.md` 참조

---

## ✅ 테스트 체크리스트

- [ ] `npm run dev` 실행 시 에러 없음
- [ ] 모드 선택 버튼 표시
- [ ] Google 로그인 (admin@gmail.com 아닌 경우 자동 로그아웃)
- [ ] 학생 업로드 폼 파싱 정상
- [ ] 미리보기 테이블 표시
- [ ] Firestore 업로드 성공 메시지
- [ ] 학생 목록 로드 및 검색
- [ ] 학생 수정/삭제 동작
- [ ] 반 설정 저장
- [ ] 학생 조회 페이지: 학번 입력 → 자신 데이터만 표시
- [ ] 다른 학생 ID로 조회 시: "문서 없음" 또는 다른 학생 데이터 표시 안 됨

---

## 📋 다음 단계 (선택사항)

1. **Firestore 규칙 배포** (필수)
   - Firebase Console → Rules 탭 → 코드 붙여넣기 → Publish
   - 테스트 시나리오로 검증

2. **데이터 마이그레이션** (필요 시)
   - GAS 학생 시트 → Firestore students 컬렉션
   - 일회성 스크립트 또는 수동 업로드

3. **프로덕션 배포**
   - `npm run build`
   - Firebase Hosting: `firebase deploy`
   - 또는 별도 호스팅 (Vercel, Netlify 등)

4. **고급 기능** (향후)
   - 점수 입력 탭 (관리자)
   - 성적 기록 조회 (학생)
   - 내보내기 (CSV/Excel)
   - 대시보드 통계 (평균, 분포)

---

## 🔍 Firestore 검증 팁

1. **Firebase Console** → Firestore → "Data" 탭
   - `students` 컬렉션 데이터 확인
   - 문서 구조: `{studentId}` (document ID)

2. **Security Rules 테스트**
   - "Rules" 탭 → "Rules Simulator"
   - Collection: `students`
   - Document: `S001`
   - Auth email: `goodojb@gmail.com`
   - Operation: `read` → Allow 확인

3. **네트워크 요청 확인** (브라우저 DevTools)
   - 학생 조회: `GET /documents/projects/.../databases/.../documents/students/S001`
   - 상태: 200 (성공) 또는 403 (권한 없음)

---

## 📞 트러블슈팅

**"권한 없음" 오류**
- Firestore 규칙이 아직 배포되지 않음
- `FIRESTORE_DEPLOYMENT.md`의 Rules를 Firebase Console에 붙여넣기

**"문서 없음"**
- 학번이 Firestore에 없음
- 관리자 모드에서 학생 정보 업로드 필요

**Upload 시 "유효한 학생이 없음"**
- 파싱 에러 목록 확인
- 필드 6개 이상, 학번/이름 필수, 반 범위 1-N, 석차/성적 숫자 확인

**상태 메시지 미표시**
- 콘솔 DevTools (F12) → Console 탭에서 에러 확인
- Firestore 쿼터/권한 문제 가능성

---

## 📝 요약

✅ **완료**:
- GAS 기존 기능 (설정, 업로드, 검증, 반 설정) 유지
- Firebase Firestore 스키마 설계 + 보안 규칙 작성
- React 앱: Mode selection → Admin auth → AdminDashboard + StudentLookup
- AdminDashboard: 학생 CRUD, 업로드, 반 설정
- 빌드: 0 에러, 39 modules, dist/ 생성

⏳ **다음**:
1. Firestore 규칙 배포 (Firebase Console)
2. 개발 서버 테스트 (npm run dev)
3. 필요시 데이터 마이그레이션

🎉 **프로젝트 이정표**: Stage 1 → 2 → 3 완료. 배포 준비 중.
