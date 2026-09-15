import { useEffect, useState } from 'react';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './TermSelector.css';

const CURRENT_YEAR = new Date().getFullYear();

export default function TermSelector({ currentTermId, onTermChange }) {
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newYear, setNewYear] = useState(CURRENT_YEAR);
  const [newSemester, setNewSemester] = useState(1);
  const [newClassCount, setNewClassCount] = useState(2);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTerms = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'terms'));
      const list = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.year - a.year || b.semester - a.semester);
      setTerms(list);

      if (list.length === 0) {
        setShowCreate(true);
        onTermChange(null);
      } else {
        const matched = list.find(t => t.id === currentTermId);
        onTermChange(matched || list[0]);
      }
    } catch (error) {
      console.error('학기 목록 로드 실패:', error);
      setMessage(`❌ 학기 목록 로드 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = termId => {
    const term = terms.find(t => t.id === termId);
    if (term) onTermChange(term);
  };

  const handleCreate = async () => {
    const termId = `${newYear}-${newSemester}`;
    if (terms.some(t => t.id === termId)) {
      setMessage('❌ 이미 존재하는 학기입니다.');
      return;
    }

    try {
      const termData = {
        year: newYear,
        semester: newSemester,
        label: `${newYear}학년도 ${newSemester}학기`,
        classFormationCount: newClassCount,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await setDoc(doc(db, 'terms', termId), termData);
      setMessage(`✅ ${termData.label} 생성 완료`);
      setShowCreate(false);
      await loadTerms();
    } catch (error) {
      console.error('학기 생성 실패:', error);
      setMessage(`❌ 학기 생성 실패: ${error.message}`);
    }
  };

  const handleChangeClassCount = async count => {
    if (!currentTermId) return;
    try {
      await updateDoc(doc(db, 'terms', currentTermId), {
        classFormationCount: count,
        updatedAt: new Date()
      });
      await loadTerms();
    } catch (error) {
      console.error('반 개수 변경 실패:', error);
      setMessage(`❌ 반 개수 변경 실패: ${error.message}`);
    }
  };

  const currentTerm = terms.find(t => t.id === currentTermId);

  return (
    <div className="term-selector">
      {loading ? (
        <span className="term-loading">학기 정보 불러오는 중...</span>
      ) : (
        <>
          <div className="term-current">
            <span className="term-tag">학기</span>

            {terms.length > 0 && (
              <select value={currentTermId || ''} onChange={e => handleSelect(e.target.value)}>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}

            {currentTerm && (
              <div className="term-class-count">
                <span className="term-tag">반 개수</span>
                {[2, 3].map(count => (
                  <button
                    key={count}
                    className={`class-count-btn ${currentTerm.classFormationCount === count ? 'active' : ''}`}
                    onClick={() => handleChangeClassCount(count)}
                  >
                    {count}개
                  </button>
                ))}
              </div>
            )}

            <button className="btn-small btn-outline" onClick={() => setShowCreate(v => !v)}>
              + 새 학기
            </button>
          </div>

          {showCreate && (
            <div className="term-create-form">
              <input
                type="number"
                value={newYear}
                onChange={e => setNewYear(parseInt(e.target.value, 10) || CURRENT_YEAR)}
              />
              <select value={newSemester} onChange={e => setNewSemester(parseInt(e.target.value, 10))}>
                <option value={1}>1학기</option>
                <option value={2}>2학기</option>
              </select>
              <select value={newClassCount} onChange={e => setNewClassCount(parseInt(e.target.value, 10))}>
                <option value={2}>2개 반</option>
                <option value={3}>3개 반</option>
              </select>
              <button className="btn btn-primary" onClick={handleCreate}>
                학기 생성
              </button>
              {terms.length > 0 && (
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>
                  취소
                </button>
              )}
            </div>
          )}

          {message && <div className="message">{message}</div>}
        </>
      )}
    </div>
  );
}
