# Firestore 데이터 구조

## 컬렉션 설계

### 1. `students` - 학생 정보
문서 ID: `{studentId}` (예: "2026001")

```json
{
  "studentId": "2026001",
  "name": "홍길동",
  "studentClass": "1반",
  "session": "1교시",
  "group": "1조",
  "baseScore": 10,
  "rank": 12,
  "prevSemesterRank": 12,
  "prevSemesterFinalScore": 18.5,
  "finalScore": 10,
  "plusScore": 0,
  "minusScore": 0,
  "role": "조장 (Chief)",
  "createdAt": "2026-01-15T09:30:00Z",
  "updatedAt": "2026-06-25T15:45:00Z"
}
```

### 2. `scoreRecords` - 가감점 내역
문서 ID: 자동 생성 (Firestore UID)

```json
{
  "studentId": "2026001",
  "name": "홍길동",
  "scoreChange": "+0.5",
  "reason": "적극적 참여",
  "comment": "조별 토의에서 좋은 의견 제시",
  "timestamp": "2026-06-25T15:45:00Z"
}
```

### 3. `examScores` - 시험 성적
문서 ID: `{studentId}_{examType}` (예: "2026001_midterm")

```json
{
  "studentId": "2026001",
  "name": "홍길동",
  "examType": "midterm",
  "score": 85,
  "createdAt": "2026-05-20T10:00:00Z",
  "updatedAt": "2026-06-25T15:45:00Z"
}
```

### 4. `settings` - 환경설정
문서 ID: `classFormation`

```json
{
  "classFormationCount": 3,
  "updatedAt": "2026-01-15T09:30:00Z",
  "updatedBy": "goodojb@gmail.com"
}
```

### 5. `admins` - 관리자 목록
문서 ID: `{email_hash}` (예: "goodojb_gmail_com")

```json
{
  "email": "goodojb@gmail.com",
  "name": "관리자",
  "role": "admin",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

## 접근 정책

| 역할 | students | scoreRecords | examScores | settings | admins |
|------|----------|--------------|-----------|----------|--------|
| 관리자 | R/W | R/W | R/W | R/W | R |
| 학생 | R (자신만) | R (자신만) | R (자신만) | R | - |
| 비인증 | - | - | - | - | - |

## Firestore 초기화 시퀀스

1. GAS에서 Firestore로 데이터 이관 (Cloud Functions 또는 관리자 화면)
2. 보안 규칙 배포
3. 학생 조회 API 활성화 (Cloud Functions)
4. 관리자 화면에서 학생 정보 관리

## 주요 쿼리 패턴

### 관리자용
- 전체 학생 조회
- 학생별 가감점 조회
- 시험 성적 조회

### 학생용
- 자신의 정보 조회 (studentId로 정확히 조회만 가능)
- 자신의 가감점 내역 조회
- 자신의 시험 성적 조회

## 보안 고려사항
- 학생은 학번(studentId)으로만 조회 가능 (쿼리 불가)
- 학생은 다른 학생 정보 조회 불가
- 관리자만 쓰기/삭제 가능
- 모든 쓰기에 타임스탐프 기록
