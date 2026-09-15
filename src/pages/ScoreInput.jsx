import React, { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import './ScoreInput.css';

const SCORE_OPTIONS = [];
for (let i = -1; i <= 5; i += 0.5) {
  SCORE_OPTIONS.push(i);
}

const INPUT_TYPE = {
  GROUP: 'group',
  INDIVIDUAL: 'individual'
};

export default function ScoreInput({ termId, classFormationCount }) {
  const [inputType, setInputType] = useState(INPUT_TYPE.GROUP);
  const [selectedClass, setSelectedClass] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState(1);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSearchId, setStudentSearchId] = useState('');
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [score, setScore] = useState(0);
  const [reasonCode, setReasonCode] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadReasons();
  }, []);

  useEffect(() => {
    if (!termId) return;
    if (inputType === INPUT_TYPE.GROUP) {
      loadGroupStudents(selectedClass, selectedGroup);
    } else if (inputType === INPUT_TYPE.INDIVIDUAL) {
      loadAllStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, selectedClass, selectedGroup, inputType]);

  const loadReasons = async () => {
    try {
      const docRef = doc(db, 'settings', 'scoreReasons');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setReasons(data.reasons || []);
      }
    } catch (err) {
      console.error('사유 로드 실패:', err);
    }
  };

  const loadGroupStudents = async (cls, group) => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'terms', termId, 'enrollments'),
        where('studentClass', '==', cls),
        where('group', '==', group)
      );
      const snapshot = await getDocs(q);
      setStudents(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('학생 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllStudents = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'terms', termId, 'enrollments'));
      setAllStudents(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('전체 학생 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStudentSearch = (searchText) => {
    setStudentSearchId(searchText);
    if (searchText.trim().length > 0) {
      const filtered = allStudents.filter(s =>
        s.studentId.includes(searchText) || (s.name && s.name.includes(searchText))
      );
      setFilteredStudents(filtered);
      setShowSearchResults(true);
    } else {
      setFilteredStudents([]);
      setShowSearchResults(false);
      setSelectedStudent(null);
    }
  };

  const selectStudent = (student) => {
    setSelectedStudent(student);
    setStudentSearchId(student.studentId);
    setShowSearchResults(false);
  };

  const applyToAll = async () => {
    if (inputType === INPUT_TYPE.GROUP && students.length === 0) {
      setMessage('❌ 조에 학생이 없습니다.');
      return;
    }

    if (inputType === INPUT_TYPE.INDIVIDUAL && !selectedStudent) {
      setMessage('❌ 학생을 선택하세요.');
      return;
    }

    const reason = customReason || reasons.find(r => r.code === reasonCode)?.name || '';

    try {
      setLoading(true);

      const records = [];
      if (inputType === INPUT_TYPE.GROUP) {
        records.push(
          ...students.map(s => ({
            studentId: s.studentId,
            name: s.name,
            studentClass: s.studentClass,
            group: s.group ?? null,
            score,
            reason,
            reasonCode,
            inputType: 'group',
            createdAt: serverTimestamp()
          }))
        );
      } else {
        records.push({
          studentId: selectedStudent.studentId,
          name: selectedStudent.name,
          studentClass: selectedStudent.studentClass,
          group: selectedStudent.group ?? null,
          score,
          reason,
          reasonCode,
          inputType: 'individual',
          createdAt: serverTimestamp()
        });
      }

      for (const record of records) {
        await addDoc(collection(db, 'terms', termId, 'scoreRecords'), record);
      }

      setMessage(`✅ ${records.length}건 저장 완료`);
      setScore(0);
      setReasonCode('');
      setCustomReason('');
      setSelectedStudent(null);

      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('저장 실패:', err);
      setMessage(`❌ 저장 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="score-input">
      {/* 입력 방식 선택 */}
      <div className="input-type-selector">
        <label>📝 입력 방식</label>
        <div className="type-buttons">
          <button
            className={`type-btn ${inputType === INPUT_TYPE.GROUP ? 'active' : ''}`}
            onClick={() => setInputType(INPUT_TYPE.GROUP)}
          >
            👥 조 단위
          </button>
          <button
            className={`type-btn ${inputType === INPUT_TYPE.INDIVIDUAL ? 'active' : ''}`}
            onClick={() => setInputType(INPUT_TYPE.INDIVIDUAL)}
          >
            👤 개인 단위
          </button>
        </div>
      </div>

      {/* 조 단위 입력 */}
      {inputType === INPUT_TYPE.GROUP && (
        <div className="input-section">
          <div className="row">
            <div className="form-group">
              <label>반</label>
              <select value={selectedClass} onChange={(e) => setSelectedClass(parseInt(e.target.value))}>
                {Array.from({ length: classFormationCount }, (_, i) => i + 1).map(cls => (
                  <option key={cls} value={cls}>{cls}반</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>조</label>
              <select value={selectedGroup} onChange={(e) => setSelectedGroup(parseInt(e.target.value))}>
                {Array.from({ length: 6 }, (_, i) => i + 1).map(g => (
                  <option key={g} value={g}>{g}조</option>
                ))}
              </select>
            </div>
          </div>

          {students.length > 0 && (
            <div className="student-list">
              <p className="list-title">학생 목록 ({students.length}명)</p>
              <div className="names">
                {students.map(s => (
                  <span key={s.id} className="name-badge">{s.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 개인 단위 입력 */}
      {inputType === INPUT_TYPE.INDIVIDUAL && (
        <div className="input-section">
          <div className="form-group">
            <label>학번/이름 검색</label>
            <div className="search-wrapper">
              <input
                type="text"
                placeholder="학번 또는 이름 입력 (예: 2026001 또는 김철수)"
                value={studentSearchId}
                onChange={(e) => handleStudentSearch(e.target.value)}
                onFocus={() => studentSearchId && setShowSearchResults(true)}
              />
              {showSearchResults && filteredStudents.length > 0 && (
                <div className="search-results">
                  {filteredStudents.map(student => (
                    <div
                      key={student.id}
                      className="search-result-item"
                      onClick={() => selectStudent(student)}
                    >
                      <span className="student-name">{student.name}</span>
                      <span className="student-id">({student.studentId})</span>
                      <span className="student-class">{student.studentClass}반</span>
                    </div>
                  ))}
                </div>
              )}
              {showSearchResults && studentSearchId && filteredStudents.length === 0 && (
                <div className="search-results">
                  <div className="no-results">검색 결과 없음</div>
                </div>
              )}
            </div>
          </div>

          {selectedStudent && (
            <div className="selected-student">
              <span className="badge">{selectedStudent.name}</span>
              <span className="detail">({selectedStudent.studentId}) - {selectedStudent.studentClass}반</span>
              <button
                className="btn-remove"
                onClick={() => {
                  setSelectedStudent(null);
                  setStudentSearchId('');
                  setFilteredStudents([]);
                  setShowSearchResults(false);
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* 점수 선택 */}
      <div className="input-section">
        <div className="form-group">
          <label>💯 점수 (-1 ~ 5, 0.5점 간격)</label>
          <div className="score-grid">
            {SCORE_OPTIONS.map(s => (
              <button
                key={s}
                className={`score-btn ${score === s ? 'active' : ''}`}
                onClick={() => setScore(s)}
              >
                {s > 0 ? '+' : ''}{s}
              </button>
            ))}
          </div>
          <p className="selected-score">선택된 점수: <strong>{score > 0 ? '+' : ''}{score}</strong></p>
        </div>
      </div>

      {/* 사유 선택 */}
      <div className="input-section">
        <div className="form-group">
          <label>📌 사유</label>
          <div className="reason-row">
            <select
              value={reasonCode}
              onChange={(e) => {
                setReasonCode(e.target.value);
                if (e.target.value) {
                  const reason = reasons.find(r => r.code === e.target.value);
                  setCustomReason(reason?.name || '');
                }
              }}
            >
              <option value="">-- 기준정보에서 선택 --</option>
              {reasons.map(r => (
                <option key={r.code} value={r.code}>{r.code}: {r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>사유 (직접 입력)</label>
          <input
            type="text"
            placeholder="예: 열정적인 참여, 우수한 결과 등"
            value={customReason}
            onChange={(e) => {
              setCustomReason(e.target.value);
              setReasonCode(''); // 직접 입력 시 코드 초기화
            }}
          />
          {customReason && <p className="hint">입력된 사유: <strong>{customReason}</strong></p>}
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="action-row">
        <button
          className="save-btn"
          onClick={applyToAll}
          disabled={loading}
        >
          {loading ? '저장 중...' : '💾 저장'}
        </button>
      </div>

      {/* 메시지 */}
      {message && <div className="message">{message}</div>}
    </div>
  );
}
