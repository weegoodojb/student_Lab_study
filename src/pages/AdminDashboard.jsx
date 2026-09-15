import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  limit,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import TermSelector from './TermSelector';
import RouletteTab from './RouletteTab';
import ScoreInput from './ScoreInput';
import QuizTab from './QuizTab';
import GradeManagement from './GradeManagement';
import StudentKiosk from './StudentKiosk';
import './AdminDashboard.css';

const LEGACY_COLLECTIONS = ['students', 'scoreRecords', 'rouletteHistory'];

export default function AdminDashboard() {
  const [currentTerm, setCurrentTerm] = useState(null);
  const termId = currentTerm?.id || null;
  const classFormationCount = currentTerm?.classFormationCount ?? 2;

  const [activeTab, setActiveTab] = useState('students');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scoreReasons, setScoreReasons] = useState([]);
  const [newReasonCode, setNewReasonCode] = useState('');
  const [newReasonName, setNewReasonName] = useState('');
  const [autoAssignmentClass, setAutoAssignmentClass] = useState(1);
  const [autoAssignmentLoading, setAutoAssignmentLoading] = useState(false);
  const [autoAssignmentMessage, setAutoAssignmentMessage] = useState('');
  const [uploadState, setUploadState] = useState({
    textInput: '',
    parseErrors: [],
    validRows: [],
    previewRows: [],
    uploadMessage: ''
  });
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [showAllStudents, setShowAllStudents] = useState(false);
  const [detailSearchText, setDetailSearchText] = useState('');
  const [selectedDetailStudent, setSelectedDetailStudent] = useState(null);
  const [detailScoreRecords, setDetailScoreRecords] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMessage, setDetailMessage] = useState('');
  const [coachPrompt, setCoachPrompt] = useState('');
  const [detailMemo, setDetailMemo] = useState({
    strengths: '',
    traits: ''
  });
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Load term-scoped data whenever the selected term changes
  useEffect(() => {
    if (!termId) return;
    loadStudents();
    loadScoreReasons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  // Load all students (current term)
  const loadStudents = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'terms', termId, 'enrollments'), limit(500));
      const snapshot = await getDocs(q);
      const studentsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStudents(studentsList);
    } catch (error) {
      console.error('학생 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load score reasons (global, shared across terms)
  const loadScoreReasons = async () => {
    try {
      const docSnap = await getDocs(collection(db, 'settings'));
      const reasonsDoc = docSnap.docs.find(d => d.id === 'scoreReasons');
      if (reasonsDoc) {
        setScoreReasons(reasonsDoc.data().reasons || []);
      }
    } catch (error) {
      console.error('사유 로드 실패:', error);
    }
  };

  // Add score reason
  const addScoreReason = async () => {
    if (!newReasonCode || !newReasonName) {
      setUploadState(prev => ({
        ...prev,
        uploadMessage: '❌ 코드와 이름을 모두 입력하세요.'
      }));
      return;
    }

    try {
      const newReasons = [
        ...scoreReasons,
        { code: newReasonCode, name: newReasonName }
      ];
      const settingsRef = doc(db, 'settings', 'scoreReasons');
      await setDoc(settingsRef, { reasons: newReasons }, { merge: true });
      setScoreReasons(newReasons);
      setNewReasonCode('');
      setNewReasonName('');
      setUploadState(prev => ({
        ...prev,
        uploadMessage: '✅ 사유 추가 완료'
      }));
    } catch (error) {
      console.error('사유 추가 실패:', error);
      setUploadState(prev => ({
        ...prev,
        uploadMessage: `❌ 사유 추가 실패: ${error.message}`
      }));
    }
  };

  // Delete score reason
  const deleteScoreReason = async (code) => {
    if (!window.confirm(`${code} 사유를 삭제하시겠습니까?`)) return;

    try {
      const newReasons = scoreReasons.filter(r => r.code !== code);
      const settingsRef = doc(db, 'settings', 'scoreReasons');
      await setDoc(settingsRef, { reasons: newReasons }, { merge: true });
      setScoreReasons(newReasons);
      setUploadState(prev => ({
        ...prev,
        uploadMessage: '✅ 사유 삭제 완료'
      }));
    } catch (error) {
      console.error('사유 삭제 실패:', error);
      setUploadState(prev => ({
        ...prev,
        uploadMessage: `❌ 사유 삭제 실패: ${error.message}`
      }));
    }
  };

  // Auto-assign groups based on rank
  const autoAssignGroups = async () => {
    if (!window.confirm(`${autoAssignmentClass}반의 조를 자동 편성하시겠습니까?`)) return;

    try {
      setAutoAssignmentLoading(true);

      // Get all students in the selected class
      const q = query(
        collection(db, 'terms', termId, 'enrollments'),
        where('studentClass', '==', autoAssignmentClass)
      );
      const snapshot = await getDocs(q);
      const classStudents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      if (classStudents.length === 0) {
        setAutoAssignmentMessage('❌ 해당 반에 학생이 없습니다.');
        return;
      }

      // Sort by rank (석차)
      classStudents.sort((a, b) => {
        const rankA = parseInt(a.rank) || 9999;
        const rankB = parseInt(b.rank) || 9999;
        return rankA - rankB;
      });

      // Assign groups: Top 6 as leaders, rest distributed evenly
      const assignments = [];
      for (let i = 0; i < classStudents.length; i++) {
        let groupNum;
        if (i < 6) {
          // Top 6 students (ranks 1-6) become leaders of groups 1-6
          groupNum = i + 1;
        } else {
          // Remaining students distributed evenly using round-robin
          groupNum = (i % 6) + 1;
        }
        assignments.push({ id: classStudents[i].id, group: groupNum });
      }

      // Update all students with new group assignments
      for (const assignment of assignments) {
        await updateDoc(doc(db, 'terms', termId, 'enrollments', assignment.id), { group: assignment.group });
      }

      // Reload students to reflect changes
      await loadStudents();
      setAutoAssignmentMessage(`✅ ${classStudents.length}명의 조 편성 완료 (${autoAssignmentClass}반)`);
      setTimeout(() => setAutoAssignmentMessage(''), 4000);
    } catch (error) {
      console.error('조 자동 편성 실패:', error);
      setAutoAssignmentMessage(`❌ 편성 실패: ${error.message}`);
    } finally {
      setAutoAssignmentLoading(false);
    }
  };

  // Parse upload text
  const parseUploadText = (text) => {
    if (!text.trim()) {
      return { rows: [], errors: [] };
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const errors = [];
    const rows = [];

    lines.forEach((line, idx) => {
      // Skip header line if present
      if (idx === 0 && /학번|학생/.test(line)) {
        return;
      }

      const parts = line.split(/[\t,]+/).map(p => p.trim());
      if (parts.length < 5) {
        errors.push({ line: idx + 1, raw: line, reason: '필드 부족 (최소 5개 필요: 학번,이름,반,교시,석차)' });
        return;
      }

      const row = {
        studentId: parts[0],
        name: parts[1],
        studentClass: parts[2],
        session: parts[3],
        rank: parts[4]
      };

      // Basic validation
      if (!row.studentId || !row.name) {
        errors.push({ line: idx + 1, raw: line, reason: '학번 또는 이름 누락' });
        return;
      }

      const classNum = parseInt(row.studentClass);
      if (isNaN(classNum) || classNum < 1 || classNum > classFormationCount) {
        errors.push({
          line: idx + 1,
          raw: line,
          reason: `반 범위 초과 (1~${classFormationCount})`
        });
        return;
      }

      if (isNaN(parseInt(row.rank))) {
        errors.push({ line: idx + 1, raw: line, reason: '석차가 숫자가 아님' });
        return;
      }

      rows.push(row);
    });

    return { rows, errors };
  };

  // Handle text input change
  const handleUploadTextChange = (e) => {
    const text = e.target.value;
    setUploadState(prev => ({
      ...prev,
      textInput: text
    }));

    const { rows, errors } = parseUploadText(text);
    const preview = rows.slice(0, 20);

    setUploadState(prev => ({
      ...prev,
      parseErrors: errors,
      validRows: rows,
      previewRows: preview,
      uploadMessage: ''
    }));
  };

  // Upload students
  const handleUploadStudents = async () => {
    if (uploadState.parseErrors.length > 0) {
      setUploadState(prev => ({
        ...prev,
        uploadMessage: '❌ 파싱 에러가 있습니다. 수정 후 시도하세요.'
      }));
      return;
    }

    if (uploadState.validRows.length === 0) {
      setUploadState(prev => ({
        ...prev,
        uploadMessage: '❌ 유효한 학생 정보가 없습니다.'
      }));
      return;
    }

    try {
      setLoading(true);
      let uploaded = 0;
      let failed = 0;

      for (const row of uploadState.validRows) {
        try {
          const studentRef = doc(db, 'terms', termId, 'enrollments', row.studentId);
          await setDoc(studentRef, {
            studentId: row.studentId,
            name: row.name,
            studentClass: parseInt(row.studentClass),
            session: row.session,
            rank: parseInt(row.rank),
            createdAt: new Date(),
            updatedAt: new Date()
          }, { merge: true });
          uploaded++;
        } catch (err) {
          console.error(`학생 ${row.studentId} 업로드 실패:`, err);
          failed++;
        }
      }

      setUploadState(prev => ({
        ...prev,
        uploadMessage: `✅ ${uploaded}명 업로드 성공${failed > 0 ? `, ${failed}명 실패` : ''}`
      }));

      // Reload students
      loadStudents();
    } catch (error) {
      console.error('업로드 실패:', error);
      setUploadState(prev => ({
        ...prev,
        uploadMessage: `❌ 업로드 실패: ${error.message}`
      }));
    } finally {
      setLoading(false);
    }
  };

  // Delete student
  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm(`${studentId} 학생을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'terms', termId, 'enrollments', studentId));
      loadStudents();
    } catch (error) {
      console.error('삭제 실패:', error);
      alert(`삭제 실패: ${error.message}`);
    }
  };

  // Update student
  const handleUpdateStudent = async (studentId) => {
    if (!editingStudent) return;

    try {
      await updateDoc(doc(db, 'terms', termId, 'enrollments', studentId), editingStudent);
      setEditingStudent(null);
      loadStudents();
    } catch (error) {
      console.error('업데이트 실패:', error);
      alert(`업데이트 실패: ${error.message}`);
    }
  };

  // Filter students by class/group/search - the list stays empty until a condition is set,
  // so a large roster doesn't dump the whole class onto the screen by default.
  const hasStudentQuery = Boolean(filterClass) || Boolean(filterGroup) || searchText.trim().length > 0;
  const filteredStudents = (showAllStudents || hasStudentQuery)
    ? students.filter(s =>
        (!filterClass || String(s.studentClass) === filterClass) &&
        (!filterGroup || String(s.group) === filterGroup) &&
        (!searchText.trim() || s.studentId.includes(searchText) || (s.name && s.name.includes(searchText)))
      )
    : [];

  const detailCandidates = students
    .filter(s =>
      !detailSearchText ||
      s.studentId.includes(detailSearchText) ||
      (s.name && s.name.includes(detailSearchText))
    )
    .slice(0, 30);

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    if (typeof value.toDate === 'function') {
      return value.toDate().toLocaleString('ko-KR');
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('ko-KR');
  };

  const loadStudentScoreRecords = async (studentId) => {
    try {
      setDetailLoading(true);
      setDetailMessage('');
      const q = query(
        collection(db, 'terms', termId, 'scoreRecords'),
        where('studentId', '==', studentId),
        limit(300)
      );
      const snapshot = await getDocs(q);
      const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      records.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      });
      setDetailScoreRecords(records);
    } catch (error) {
      console.error('실습점수 내역 로드 실패:', error);
      setDetailMessage(`❌ 실습점수 내역 로드 실패: ${error.message}`);
      setDetailScoreRecords([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const selectDetailStudent = async (student) => {
    setSelectedDetailStudent(student);
    setDetailMemo({
      strengths: student.strengths || '',
      traits: student.traits || ''
    });
    await loadStudentScoreRecords(student.studentId);
  };

  const saveStudentMemo = async () => {
    if (!selectedDetailStudent) {
      setDetailMessage('❌ 학생을 먼저 선택하세요.');
      return;
    }

    try {
      setDetailLoading(true);
      await updateDoc(doc(db, 'terms', termId, 'enrollments', selectedDetailStudent.id), {
        strengths: detailMemo.strengths,
        traits: detailMemo.traits,
        updatedAt: new Date()
      });
      setDetailMessage('✅ 학생 특징/장점 저장 완료');
      await loadStudents();
    } catch (error) {
      console.error('학생 메모 저장 실패:', error);
      setDetailMessage(`❌ 학생 메모 저장 실패: ${error.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const buildCoachPrompt = () => {
    if (!selectedDetailStudent) {
      setDetailMessage('❌ 학생을 먼저 선택하세요.');
      return;
    }

    const recent = detailScoreRecords.slice(0, 10);
    const totalPractice = detailScoreRecords.reduce((sum, r) => sum + toNumber(r.score), 0);
    const avgRecent = recent.length > 0
      ? (recent.reduce((sum, r) => sum + toNumber(r.score), 0) / recent.length).toFixed(2)
      : '0.00';
    const reasonSummary = {};
    recent.forEach(r => {
      const key = r.reason || r.reasonCode || '미분류';
      reasonSummary[key] = (reasonSummary[key] || 0) + 1;
    });
    const reasonText = Object.entries(reasonSummary)
      .map(([name, count]) => `${name}(${count}회)`)
      .join(', ') || '최근 사유 기록 없음';

    const prompt = [
      '당신은 대학 전공 실습 코치입니다. 아래 데이터를 바탕으로 구체적인 코칭 전략을 제안해 주세요.',
      '',
      '[수업 맥락]',
      '- 대상: 임상병리학과 2학년',
      '- 과목: 미생물학실습',
      '',
      '[실습점수 요약]',
      `- 누적 실습점수: ${totalPractice}`,
      `- 전체 기록 건수: ${detailScoreRecords.length}`,
      `- 최근 ${recent.length}건 평균 점수: ${avgRecent}`,
      `- 최근 사유 분포: ${reasonText}`,
      '',
      '[교사 메모]',
      `- 강점: ${detailMemo.strengths || '기록 없음'}`,
      `- 특징/지도 메모: ${detailMemo.traits || '기록 없음'}`,
      '',
      '[요청 사항]',
      '1) 다음 2주 수업 기준으로 실행 가능한 코칭 계획 5가지를 제안해 주세요.',
      '2) 학생 강점을 활용한 동기부여 방법 3가지를 제안해 주세요.',
      '3) 실습점수가 낮아질 때의 조기 경고 신호와 개입 방법을 표로 정리해 주세요.',
      '4) 교사가 수업 직후 기록할 체크리스트(5개 항목)를 제시해 주세요.'
    ].join('\n');

    setCoachPrompt(prompt);
    setDetailMessage('✅ AI 코치 요청 프롬프트 생성 완료');
  };

  const copyCoachPrompt = async () => {
    if (!coachPrompt) {
      setDetailMessage('❌ 먼저 프롬프트를 생성하세요.');
      return;
    }

    try {
      await navigator.clipboard.writeText(coachPrompt);
      setDetailMessage('✅ 프롬프트 복사 완료');
    } catch (error) {
      console.error('프롬프트 복사 실패:', error);
      setDetailMessage('❌ 복사 실패: 브라우저 권한을 확인하세요.');
    }
  };

  const handleResetLegacyData = async () => {
    if (resetConfirmText !== '초기화') return;
    if (!window.confirm('정말로 기존 최상위 컬렉션(students/scoreRecords/rouletteHistory/settings.classFormation)을 모두 삭제하시겠습니까? 되돌릴 수 없습니다.')) {
      return;
    }

    try {
      setResetting(true);
      for (const col of LEGACY_COLLECTIONS) {
        const snapshot = await getDocs(collection(db, col));
        for (const d of snapshot.docs) {
          await deleteDoc(doc(db, col, d.id));
        }
      }
      await deleteDoc(doc(db, 'settings', 'classFormation')).catch(() => {});
      setResetMessage('✅ 레거시 데이터 초기화 완료. 이제 학생 관리 탭에서 새로 업로드하세요.');
      setResetConfirmText('');
    } catch (error) {
      console.error('초기화 실패:', error);
      setResetMessage(`❌ 초기화 실패: ${error.message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="admin-dashboard">
      <TermSelector currentTermId={termId} onTermChange={setCurrentTerm} />

      {!termId ? (
        <p className="note">학기를 먼저 생성하거나 선택하세요.</p>
      ) : (
        <>
          <div className="tabs-header">
            <button
              className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => setActiveTab('students')}
            >
              📚 학생 관리
            </button>
            <button
              className={`tab-btn ${activeTab === 'score' ? 'active' : ''}`}
              onClick={() => setActiveTab('score')}
            >
              💯 실습점수
            </button>
            <button
              className={`tab-btn ${activeTab === 'quiz' ? 'active' : ''}`}
              onClick={() => setActiveTab('quiz')}
            >
              📝 주차별 퀴즈
            </button>
            <button
              className={`tab-btn ${activeTab === 'detail' ? 'active' : ''}`}
              onClick={() => setActiveTab('detail')}
            >
              🔎 학생조회
            </button>
            <button
              className={`tab-btn ${activeTab === 'grade' ? 'active' : ''}`}
              onClick={() => setActiveTab('grade')}
            >
              📊 성적 관리
            </button>
            <button
              className={`tab-btn ${activeTab === 'roulette' ? 'active' : ''}`}
              onClick={() => setActiveTab('roulette')}
            >
              🎰 조 편성/룰렛
            </button>
            <button
              className={`tab-btn ${activeTab === 'kiosk' ? 'active' : ''}`}
              onClick={() => setActiveTab('kiosk')}
            >
              👤 학생 조회 키오스크
            </button>
            <button
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              ⚙️ 설정
            </button>
          </div>

          {/* Students Tab */}
          {activeTab === 'students' && (
            <div className="tab-content">
              <div className="upload-section">
                <h3>📤 학생 정보 업로드</h3>
                <div className="input-group">
                  <label>학번, 이름, 반, 교시, 석차 (탭 또는 쉼표 구분)</label>
                  <textarea
                    value={uploadState.textInput}
                    onChange={handleUploadTextChange}
                    placeholder="2026001,홍길동,1,2,5&#10;2026002,이순신,2,1,3"
                    rows={8}
                  />
                </div>

                {uploadState.previewRows.length > 0 && (
                  <div className="preview-section">
                    <h4>📋 미리보기 ({uploadState.previewRows.length})</h4>
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>학번</th>
                          <th>이름</th>
                          <th>반</th>
                          <th>교시</th>
                          <th>석차</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadState.previewRows.map((row, idx) => (
                          <tr key={idx}>
                            <td>{row.studentId}</td>
                            <td>{row.name}</td>
                            <td>{row.studentClass}</td>
                            <td>{row.session}</td>
                            <td>{row.rank}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {uploadState.parseErrors.length > 0 && (
                  <div className="error-section">
                    <h4>❌ 파싱 에러 ({uploadState.parseErrors.length})</h4>
                    <div className="error-list">
                      {uploadState.parseErrors.slice(0, 10).map((err, idx) => (
                        <div key={idx} className="error-item">
                          Line {err.line}: {err.reason} - {err.raw.substring(0, 40)}...
                        </div>
                      ))}
                      {uploadState.parseErrors.length > 10 && (
                        <div className="error-item">외 {uploadState.parseErrors.length - 10}개</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="button-group">
                  <button
                    className="btn btn-primary"
                    onClick={handleUploadStudents}
                    disabled={loading || uploadState.validRows.length === 0}
                  >
                    {loading ? '업로드 중...' : '✅ 업로드'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setUploadState({
                      textInput: '',
                      parseErrors: [],
                      validRows: [],
                      previewRows: [],
                      uploadMessage: ''
                    })}
                  >
                    🔄 초기화
                  </button>
                </div>

                {uploadState.uploadMessage && (
                  <div className="message">{uploadState.uploadMessage}</div>
                )}
              </div>

              <div className="students-list-section">
                <h3>📋 학생 목록 ({students.length})</h3>

                <div className="student-filter-row">
                  <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
                    <option value="">반 전체</option>
                    {Array.from({ length: classFormationCount }, (_, i) => i + 1).map(cls => (
                      <option key={cls} value={String(cls)}>{cls}반</option>
                    ))}
                  </select>
                  <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
                    <option value="">조 전체</option>
                    {Array.from({ length: 6 }, (_, i) => i + 1).map(g => (
                      <option key={g} value={String(g)}>{g}조</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="학번 또는 이름 검색..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="search-input"
                  />
                  <button
                    className={`btn-small ${showAllStudents ? 'btn-edit' : ''}`}
                    onClick={() => setShowAllStudents(v => !v)}
                  >
                    전체 보기
                  </button>
                </div>

                {loading && <p className="loading">로딩 중...</p>}

                {!showAllStudents && !hasStudentQuery ? (
                  <p className="note">반/조를 선택하거나 학번/이름을 검색하세요 (또는 "전체 보기").</p>
                ) : (
                  <>
                    <div className="table-wrapper">
                      <table className="students-table">
                        <thead>
                          <tr>
                            <th>학번</th>
                            <th>이름</th>
                            <th>반</th>
                            <th>조</th>
                            <th>교시</th>
                            <th>석차</th>
                            <th>작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.slice(0, 50).map((student) => (
                            <tr key={student.id}>
                              <td>{student.studentId}</td>
                              <td>{student.name}</td>
                              <td>{student.studentClass}</td>
                              <td>{student.group ?? '-'}</td>
                              <td>{student.session}</td>
                              <td>{student.rank}</td>
                              <td>
                                <button
                                  className="btn-small btn-edit"
                                  onClick={() => setEditingStudent({ ...student })}
                                >
                                  수정
                                </button>
                                <button
                                  className="btn-small btn-delete"
                                  onClick={() => handleDeleteStudent(student.id)}
                                >
                                  삭제
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {filteredStudents.length > 50 && (
                      <p className="note">상위 50명만 표시됩니다</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Student Detail Tab */}
          {activeTab === 'detail' && (
            <div className="tab-content">
              <div className="students-list-section">
                <h3>🔎 학생 조회 (관리자)</h3>
                <p className="description">학생을 선택하면 실습점수 내역과 특징/장점을 한눈에 볼 수 있습니다.</p>

                <input
                  type="text"
                  placeholder="학번 또는 이름 검색..."
                  value={detailSearchText}
                  onChange={(e) => setDetailSearchText(e.target.value)}
                  className="search-input"
                />

                <div className="detail-candidate-list">
                  {detailCandidates.map(student => (
                    <button
                      key={student.id}
                      className={`detail-candidate-btn ${selectedDetailStudent?.id === student.id ? 'active' : ''}`}
                      onClick={() => selectDetailStudent(student)}
                    >
                      <span>{student.name} ({student.studentId})</span>
                      <span>{student.studentClass}반 · {student.session}교시</span>
                    </button>
                  ))}
                </div>

                {selectedDetailStudent && (
                  <div className="student-detail-panel">
                    <div className="detail-header">
                      <h4>{selectedDetailStudent.name} ({selectedDetailStudent.studentId})</h4>
                      <p>{selectedDetailStudent.studentClass}반 · {selectedDetailStudent.session}교시 · 석차 {selectedDetailStudent.rank}</p>
                    </div>

                    <div className="detail-summary-grid">
                      <div className="summary-card">
                        <span>실습점수 누적</span>
                        <strong>{detailScoreRecords.reduce((sum, r) => sum + toNumber(r.score), 0)}</strong>
                      </div>
                      <div className="summary-card">
                        <span>기록 건수</span>
                        <strong>{detailScoreRecords.length}건</strong>
                      </div>
                      <div className="summary-card">
                        <span>최근 사유</span>
                        <strong>{detailScoreRecords[0]?.reason || '-'}</strong>
                      </div>
                    </div>

                    <div className="detail-records-table-wrap">
                      <table className="students-table">
                        <thead>
                          <tr>
                            <th>일시</th>
                            <th>점수</th>
                            <th>사유 코드</th>
                            <th>사유</th>
                            <th>입력 방식</th>
                            <th>조</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailScoreRecords.length === 0 && (
                            <tr>
                              <td colSpan={6}>실습점수 기록이 없습니다.</td>
                            </tr>
                          )}
                          {detailScoreRecords.map(record => (
                            <tr key={record.id}>
                              <td>{formatDateTime(record.createdAt)}</td>
                              <td>{record.score}</td>
                              <td>{record.reasonCode || '-'}</td>
                              <td>{record.reason || '-'}</td>
                              <td>{record.inputType === 'group' ? '조 단위' : record.inputType === 'quiz' ? '퀴즈' : '개인 단위'}</td>
                              <td>{record.group ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="detail-memo-section">
                      <h4>📝 학생 특징/장점 기록</h4>
                      <div className="form-group">
                        <label>강점</label>
                        <input
                          type="text"
                          placeholder="예: 문제 해결 속도가 빠름, 발표 자신감 높음"
                          value={detailMemo.strengths}
                          onChange={(e) => setDetailMemo(prev => ({ ...prev, strengths: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>특징/지도 메모</label>
                        <textarea
                          rows={4}
                          placeholder="예: 팀 활동 시 리더십이 좋고, 피드백 반영이 빠름"
                          value={detailMemo.traits}
                          onChange={(e) => setDetailMemo(prev => ({ ...prev, traits: e.target.value }))}
                        />
                      </div>

                      <div className="button-group">
                        <button className="btn btn-primary" onClick={saveStudentMemo} disabled={detailLoading}>
                          💾 특징/장점 저장
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => loadStudentScoreRecords(selectedDetailStudent.studentId)}
                          disabled={detailLoading}
                        >
                          🔄 실습점수 새로고침
                        </button>
                      </div>

                      <div className="button-group">
                        <button className="btn btn-primary" onClick={buildCoachPrompt} disabled={detailLoading}>
                          🤖 AI 코치 프롬프트 생성
                        </button>
                        <button className="btn btn-secondary" onClick={copyCoachPrompt} disabled={detailLoading || !coachPrompt}>
                          📋 프롬프트 복사
                        </button>
                      </div>

                      {coachPrompt && (
                        <div className="coach-prompt-box">
                          <label>AI 코치 요청 프롬프트</label>
                          <textarea value={coachPrompt} readOnly rows={14} />
                        </div>
                      )}

                      {detailMessage && (
                        <div className={`message ${detailMessage.includes('❌') ? 'error' : 'success'}`}>
                          {detailMessage}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quiz Tab */}
          {activeTab === 'quiz' && (
            <div className="tab-content">
              <QuizTab termId={termId} />
            </div>
          )}

          {/* Grade Management Tab (placeholder) */}
          {activeTab === 'grade' && (
            <div className="tab-content">
              <GradeManagement termId={termId} />
            </div>
          )}

          {/* Roulette / Group Formation Tab */}
          {activeTab === 'roulette' && (
            <div className="tab-content">
              <div className="settings-section">
                <h3>👥 조 자동 편성</h3>
                <p className="description">석차를 기준으로 1등~6등을 각 조의 조장으로, 나머지를 균등하게 배분합니다.</p>

                <div className="form-group">
                  <label>대상 반</label>
                  <select
                    value={autoAssignmentClass}
                    onChange={(e) => setAutoAssignmentClass(parseInt(e.target.value))}
                    disabled={autoAssignmentLoading}
                  >
                    {Array.from({ length: classFormationCount }, (_, i) => i + 1).map(cls => (
                      <option key={cls} value={cls}>{cls}반</option>
                    ))}
                  </select>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={autoAssignGroups}
                  disabled={autoAssignmentLoading}
                >
                  {autoAssignmentLoading ? '편성 중...' : '🎯 조 편성 실행'}
                </button>

                {autoAssignmentMessage && (
                  <div className={`message ${autoAssignmentMessage.includes('❌') ? 'error' : 'success'}`}>
                    {autoAssignmentMessage}
                  </div>
                )}
              </div>

              <RouletteTab termId={termId} classFormationCount={classFormationCount} />
            </div>
          )}

          {/* Kiosk Tab */}
          {activeTab === 'kiosk' && (
            <div className="tab-content">
              <StudentKiosk termId={termId} />
            </div>
          )}

          {/* Score Input Tab */}
          {activeTab === 'score' && (
            <div className="tab-content">
              <ScoreInput termId={termId} classFormationCount={classFormationCount} />
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="tab-content">
              <div className="settings-section">
                <h3>📌 실습점수 사유 관리</h3>
                <div className="form-group">
                  <label>사유 코드</label>
                  <input
                    type="text"
                    placeholder="예: EXCELLENT, GOOD, LATE"
                    value={newReasonCode}
                    onChange={(e) => setNewReasonCode(e.target.value)}
                    maxLength="20"
                  />
                </div>
                <div className="form-group">
                  <label>사유 명</label>
                  <input
                    type="text"
                    placeholder="예: 매우 우수함, 좋음, 지각"
                    value={newReasonName}
                    onChange={(e) => setNewReasonName(e.target.value)}
                  />
                </div>
                <button className="btn btn-secondary" onClick={addScoreReason}>
                  ➕ 사유 추가
                </button>

                {uploadState.uploadMessage && (
                  <div className="message">{uploadState.uploadMessage}</div>
                )}

                {scoreReasons.length > 0 && (
                  <div className="reasons-list">
                    <h4>등록된 사유</h4>
                    {scoreReasons.map(reason => (
                      <div key={reason.code} className="reason-item">
                        <span className="reason-badge">
                          <strong>{reason.code}</strong>: {reason.name}
                        </span>
                        <button
                          className="reason-delete"
                          onClick={() => deleteScoreReason(reason.code)}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="settings-section">
                <h3>⚠️ 레거시 데이터 초기화</h3>
                <p className="description">
                  구 버전(학기 구분 이전)의 최상위 students/scoreRecords/rouletteHistory 컬렉션과
                  settings.classFormation 문서를 삭제합니다. 되돌릴 수 없으니 한 번만 실행하세요.
                </p>
                <div className="form-group">
                  <label>확인을 위해 "초기화"를 입력하세요</label>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-delete"
                  onClick={handleResetLegacyData}
                  disabled={resetting || resetConfirmText !== '초기화'}
                >
                  {resetting ? '초기화 중...' : '🗑️ 레거시 데이터 삭제'}
                </button>
                {resetMessage && (
                  <div className={`message ${resetMessage.includes('❌') ? 'error' : 'success'}`}>
                    {resetMessage}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Modal */}
      {editingStudent && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>학생 정보 수정: {editingStudent.studentId}</h3>
            <div className="form-group">
              <label>이름</label>
              <input
                type="text"
                value={editingStudent.name || ''}
                onChange={(e) => setEditingStudent({
                  ...editingStudent,
                  name: e.target.value
                })}
              />
            </div>
            <div className="form-group">
              <label>반</label>
              <input
                type="number"
                value={editingStudent.studentClass || 1}
                onChange={(e) => setEditingStudent({
                  ...editingStudent,
                  studentClass: parseInt(e.target.value)
                })}
              />
            </div>
            <div className="form-group">
              <label>교시</label>
              <input
                type="text"
                value={editingStudent.session || ''}
                onChange={(e) => setEditingStudent({
                  ...editingStudent,
                  session: e.target.value
                })}
              />
            </div>
            <div className="form-group">
              <label>석차</label>
              <input
                type="number"
                value={editingStudent.rank || 0}
                onChange={(e) => setEditingStudent({
                  ...editingStudent,
                  rank: parseInt(e.target.value)
                })}
              />
            </div>
            <div className="button-group modal-buttons">
              <button
                className="btn btn-primary"
                onClick={() => handleUpdateStudent(editingStudent.id)}
              >
                ✅ 저장
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setEditingStudent(null)}
              >
                ❌ 취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
