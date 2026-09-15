# Firestore 보안 규칙 배포 + Google Forms / Gemini 설정 가이드

## 1. Firestore 보안 규칙 배포

1. https://console.firebase.google.com 접속 → 프로젝트 "student-practice-mgmt" 선택
2. 좌측 메뉴 → "Firestore Database" → 상단 탭 "Rules"
3. `FIRESTORE_SECURITY_RULES.txt` 내용 전체를 복사해 붙여넣기
4. "Publish" 클릭

관리자 이메일은 `isAdmin()` 함수 안에 `goodojb@gmail.com`으로 하드코딩되어 있다. 관리자 계정을
바꾸려면 **`.env`의 `VITE_ADMIN_EMAIL`과 이 규칙 파일의 이메일을 함께** 바꾸고 다시 배포해야 한다
(둘 중 하나만 바꾸면 로그인은 되는데 Firestore 읽기/쓰기가 전부 막히는 식으로 어긋난다).

### 배포 확인
- "Rules" 탭 → "Rules Simulator"에서 `terms/2026-2/enrollments/2026001` 문서를 관리자 이메일로
  read 시도 → Allow 확인, 비인증(익명)으로 시도 → Deny 확인

## 2. Google Forms API / Drive API 설정 (주차별 퀴즈 기능용, 1회)

1. https://console.cloud.google.com 접속 → Firebase 프로젝트와 동일한 GCP 프로젝트 선택
2. "API 및 서비스" → "라이브러리" → **"Google Forms API"**와 **"Google Drive API"** 둘 다 검색해서 사용 설정
   (Form은 내부적으로 Drive 파일이라, 파일명 변경/삭제(휴지통 이동)는 Drive API를 따로 쓴다)
3. "API 및 서비스" → "OAuth 동의 화면"
   - 게시 상태를 "테스트"로 두고, 관리자 본인 이메일을 "테스트 사용자"에 추가
   - 이 앱은 관리자 1인만 사용하므로 Google 검수(verification)는 필요 없다
4. 앱 코드(`src/firebase.js`)는 로그인 시 `forms.body`, `forms.responses.readonly`,
   `drive.file`(Form이 내부적으로 Drive 파일이라 필요) 스코프를 함께 요청하도록 이미
   구성되어 있다. 최초 로그인 시 Google이 "이 앱이 내 Google Forms/Drive 파일에 접근하도록
   허용하시겠습니까?" 동의 화면을 보여주면 허용하면 된다. 스코프가 바뀐 뒤에는 기존 로그인
   세션이 새 스코프를 갖고 있지 않으니, 관리자 인증 영역의 "Google 재인증" 버튼(또는
   로그아웃 후 재로그인)으로 한 번 다시 인증해야 한다.

### 참고
- Forms API로 만든 퀴즈는 "학번"/"성명" 식별 문항이 자동으로 맨 앞에 추가된다.
- 객관식(`TYPE: mc`) 문항은 Google Forms 자체 퀴즈 채점(정확히 일치하는 단답)을 사용하고,
  서술형(`TYPE: short`/`paragraph`)은 앱이 Gemini로 채점한다.
- "Google Forms/Drive API has not been used in project ... or it is disabled" 오류가 나면 위
  2번 항목이 아직 적용되지 않은 것이다. 활성화 직후에는 전파에 몇 분 걸릴 수 있다.
- OAuth access token은 로그인 시점에만 발급되고 약 1시간 후 만료된다. Form 생성/채점 중
  401 오류가 나면 관리자가 다시 로그인하면 된다.

## 3. Gemini API 키 설정 (서술형 채점용)

1. https://aistudio.google.com 에서 API 키 발급
2. `.env`에 `VITE_GEMINI_API_KEY=발급받은키` 추가
3. **중요**: 이 키는 브라우저에서 직접 호출되므로 네트워크 탭에 노출된다. Google Cloud Console
   → "API 및 서비스" → "사용자 인증 정보" → 해당 키 선택 → "애플리케이션 제한사항"을
   "HTTP 리퍼러"로 설정하고 배포 도메인(예: `https://student-practice-mgmt.web.app/*`)과
   `http://localhost:5173/*`(개발용)만 등록한다. 이렇게 해도 이 사이트를 방문한 사람이
   브라우저 콘솔로 키를 추출해 쓰는 것 자체는 막지 못하니, 사용량 알림(예산 알림)을
   함께 설정해두는 걸 권장한다.

## 4. 레거시 데이터 초기화

학기별 구조로 전환하면서 기존 최상위 `students`/`scoreRecords`/`rouletteHistory` 컬렉션은
쓰지 않는다. 관리자 대시보드 "⚙️ 설정" 탭 하단의 "레거시 데이터 초기화" 버튼으로 한 번만
삭제하면 된다 (확인 문구 "초기화"를 입력해야 실행됨). 이후 학생/조 데이터는 "📚 학생 관리"
탭에서 새 학기 기준으로 다시 업로드한다.
