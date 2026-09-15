# Firestore 데이터 구조 (학기별 히스토리 구조)

모든 학사 데이터는 학기(`terms/{termId}`) 아래로 스코프된다. 휴학/복학으로 학기마다 학생 구성이 달라져도
과거 학기 데이터는 그대로 보존되고, 새 학기는 빈 로스터에서 다시 시작한다.

## 컬렉션 설계

### 1. `terms/{termId}` - 학기
문서 ID: `{year}-{semester}` (예: "2026-2")

```json
{
  "year": 2026,
  "semester": 2,
  "label": "2026학년도 2학기",
  "classFormationCount": 2,
  "status": "active",
  "createdAt": "2026-08-25T00:00:00Z",
  "updatedAt": "2026-08-25T00:00:00Z"
}
```

### 2. `terms/{termId}/enrollments/{studentId}` - 학기별 학생 등록 정보
문서 ID: `{studentId}` (예: "2026001")

```json
{
  "studentId": "2026001",
  "name": "홍길동",
  "studentClass": 1,
  "session": "2",
  "group": 1,
  "rank": 5,
  "role": "조장",
  "baseScore": 10,
  "plusScore": 0,
  "minusScore": 0,
  "finalScore": 10,
  "attendanceScore": null,
  "midtermScore": null,
  "finalExamScore": null,
  "strengths": "문제 해결 속도가 빠름",
  "traits": "팀 활동 시 리더십이 좋음",
  "pinHash": "sha256 hex, 학생 조회 키오스크 본인확인용",
  "pinSetAt": "2026-09-01T05:00:00Z",
  "createdAt": "2026-08-25T00:00:00Z",
  "updatedAt": "2026-09-01T05:00:00Z"
}
```

`attendanceScore`/`midtermScore`/`finalExamScore`는 출석부/중간/기말 성적 확장(성적 관리 탭)을 위한 자리로,
업로드 형식이 확정되기 전까지는 비어 있다.

이전 학기 정보가 필요하면 `terms/{prevTermId}/enrollments/{studentId}`를 그때그때 조회한다
(연도/학기를 하나 낮춰 계산). 중복 저장 필드(`prevSemesterRank` 등)는 두지 않는다 - 드리프트 방지.

### 3. `terms/{termId}/scoreRecords/{recordId}` - 실습점수 가감점 내역 (퀴즈 점수 포함)
문서 ID: 자동 생성

```json
{
  "studentId": "2026001",
  "name": "홍길동",
  "studentClass": 1,
  "group": 1,
  "score": 0.5,
  "reason": "적극적 참여",
  "reasonCode": "GOOD",
  "inputType": "group",
  "createdAt": "2026-09-01T05:00:00Z"
}
```

주차별 퀴즈가 확정되면 `inputType: "quiz"`, `reasonCode: "QUIZ"`, `quizId`가 채워진 레코드가 추가되어
같은 합산 로직(학생별 `where('studentId','==', id)`)에 자연스럽게 포함된다.

### 4. `terms/{termId}/rouletteHistory/{id}` - 조-테이블 추첨 이력

### 5. `terms/{termId}/gradeImports/{id}` - (자리만 마련) 출석/중간/기말 엑셀 업로드 로그
형식이 확정되면 사용. 현재는 미사용.

### 6. `terms/{termId}/quizTemplates/{templateId}` - 재사용 가능한 퀴즈 원본

```json
{
  "title": "[3주차 점검] Neisseria Moraxella 동정",
  "week": "3주차",
  "footerPrompt": "오늘 수업을 마친 후 해결되지 않았거나 가장 궁금한 점 1가지를 적어주세요.",
  "questions": [
    { "order": 1, "type": "mc", "prompt": "...", "points": 1, "correctAnswer": "Oxidase 시험" },
    { "order": 2, "type": "short", "prompt": "...", "points": 1, "rubric": "..." }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

관리자 화면의 문항 입력 폼(문항당 유형/배점/정답 또는 채점기준을 직접 입력, 최대 10문항)으로 저장하는
원본이다. 학번/성명 식별 문항은 여기 포함되지 않고 Form 생성 시 항상 자동으로 맨 앞에 추가된다.
`footerPrompt`는 0점 처리되는 마무리 질문으로, Form 맨 끝에 선택 항목으로 붙는다.

### 7. `terms/{termId}/quizzes/{quizId}` - 주차별로 활성화된 퀴즈 (템플릿의 실행 인스턴스)

```json
{
  "title": "[3주차 점검] Neisseria Moraxella 동정",
  "week": "3주차",
  "templateId": "...",
  "footerPrompt": "...",
  "deadlineAt": "2026-09-22T05:10:00Z",
  "status": "draft",
  "formId": "...",
  "responderUri": "https://docs.google.com/forms/d/e/.../viewform",
  "editUri": "https://docs.google.com/forms/d/.../edit",
  "studentIdQuestionId": "...",
  "nameQuestionId": "...",
  "questionIdByOrder": { "1": "...", "2": "..." },
  "footerQuestionId": "...",
  "questions": [ "... (템플릿에서 복사됨)" ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

`status`: `draft` → `form_created` → `graded` → `finalized`.

`deadlineAt`은 기록용 라벨이다 (Form 설명에도 표시됨). 실제 응답 수집 종료는 여전히 관리자가
"응답 수집 + 채점 시작"을 누르는 시점에 이뤄진다 — 이 시각이 지난다고 Form이 자동으로 닫히지는
않는다 (자동 마감을 하려면 별도 서버/스케줄러가 필요).

같은 학번으로 여러 번 제출한 경우, 채점 시점에 **가장 마지막(최신) 제출만** 채점 대상으로 남고
이전 제출은 버려진다.

#### `terms/{termId}/quizzes/{quizId}/responses/{studentId}` - 학생별 채점 결과

```json
{
  "studentId": "2026001",
  "name": "홍길동",
  "studentClass": 1,
  "group": 1,
  "grading": [
    { "questionOrder": 1, "score": 1, "maxScore": 1, "source": "forms_auto" },
    { "questionOrder": 2, "score": 0.8, "maxScore": 1, "source": "gemini", "rationale": "핵심 요지는 포함하나 표현이 다소 부족" }
  ],
  "aiTotalScore": 1.8,
  "finalScore": 1.8,
  "feedback": "그람염색 순서가 아직 헷갈려요",
  "needsReview": false,
  "reviewed": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

학번 매칭에 실패한 응답은 `studentId: null`, `rawStudentIdInput`, `needsReview: true`로 저장되며
관리자가 화면에서 올바른 학번으로 재연결하기 전까지는 확정(점수 반영) 대상에서 제외된다.

### 8. `settings/scoreReasons` - 실습점수 사유 (전역, 학기 불문 공통)

```json
{ "reasons": [{ "code": "EXCELLENT", "name": "매우 우수함" }] }
```

### 9. `admins/{adminId}` - 관리자 목록 (참고용, 현재 보안 규칙은 이메일 하드코딩 사용)

## 접근 정책

| 역할 | terms/** | settings | admins |
|------|----------|----------|--------|
| 관리자 (VITE_ADMIN_EMAIL) | R/W/D | R/W | R/W |
| 그 외 모든 사용자 | - | - | - |

학생은 별도 로그인이 없다. 학생 성적 조회(키오스크)는 관리자 PC에서 관리자가 이미 로그인한 세션 안에서만
동작하며, 4자리 코드는 Firestore 접근 권한과 무관한 "본인 확인" UX 장치일 뿐이다. 자세한 내용은
`FIRESTORE_SECURITY_RULES.txt`, `FIRESTORE_DEPLOYMENT.md` 참고.
