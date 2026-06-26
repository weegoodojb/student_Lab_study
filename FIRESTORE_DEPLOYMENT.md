# Firestore 보안 규칙 배포 가이드

## 1. Firebase Console 접속
- https://console.firebase.google.com
- 프로젝트 선택: "student-practice-mgmt"

## 2. Firestore Database 규칙 배포

### Step 1: Rules 탭 열기
1. 좌측 메뉴 → "Firestore Database"
2. 상단 탭 → "Rules"

### Step 2: 기존 규칙 교체
1. 편집 버튼 또는 코드 영역 클릭
2. 아래 규칙 전체 복사 후 붙여넣기:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAdmin() {
      return request.auth.token.email == "goodojb@gmail.com";
    }
    
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isOwnStudent(studentId) {
      return request.auth.token.email == resource.data.createdBy;
    }

    // Collections
    match /students/{studentId} {
      allow read: if isAdmin() || (isAuthenticated() && studentId == request.auth.uid);
      allow write: if isAdmin();
      allow delete: if isAdmin();
    }

    match /scoreRecords/{document=**} {
      allow read: if isAdmin();
      allow create: if isAdmin();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    match /examScores/{document=**} {
      allow read: if isAdmin();
      allow write: if isAdmin();
      allow delete: if isAdmin();
    }

    match /settings/{document=**} {
      allow read: if isAdmin();
      allow write: if isAdmin();
      allow delete: if isAdmin();
    }

    match /admins/{document=**} {
      allow read: if isAdmin();
      allow write: if isAdmin();
      allow delete: if isAdmin();
    }

    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Step 3: 게시 (Publish)
1. "Publish" 또는 "Save" 버튼 클릭
2. 경고 메시지 확인 후 "Publish"
3. 배포 완료 메시지 확인

## 3. 규칙 테스트 (선택사항)
1. "Rules" 탭에서 "Rules Simulator" 클릭
2. 테스트 시나리오 입력:
   - Collection: `students`
   - Document: `S001`
   - Operation: `read`
   - Authentication: {"email": "goodojb@gmail.com"}
3. "Run" 클릭 → 결과 확인

## 4. 배포 확인
- Firebase Console → Firestore → "Rules" 탭에서 배포 시간 및 상태 확인
- 앱에서 학생 조회 시 "문서 없음" 또는 정상 데이터 표시 확인

## 주의사항
- 보안 규칙 배포 후 학생은 자신의 문서만 조회 가능 (studentId 정확히 일치)
- 관리자(goodojb@gmail.com)만 모든 학생 문서 접근 가능
- 쿼리(where) 연산은 학생에게 제한됨
