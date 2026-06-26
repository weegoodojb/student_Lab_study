import { useEffect, useState } from 'react';
import { getDoc, doc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import './StudentLookup.css';

function StudentLookup() {
  const [studentId, setStudentId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const loadPracticeTotal = async (id) => {
    const q = query(collection(db, 'scoreRecords'), where('studentId', '==', id));
    const snapshot = await getDocs(q);
    return snapshot.docs.reduce((sum, item) => sum + toNumber(item.data().score), 0);
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    setError('');
    setNotFound(false);
    setResult(null);

    if (!studentId.trim()) {
      setError('학번을 입력하세요.');
      return;
    }

    try {
      setLoading(true);
      const docRef = doc(db, 'students', studentId.trim());
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        setNotFound(true);
        setError(`학번 ${studentId.trim()}의 정보를 찾을 수 없습니다.`);
        return;
      }

      const data = docSnap.data();
      const practiceTotal = await loadPracticeTotal(studentId.trim());
      const midtermScore = toNumber(data.midtermScore ?? data.midterm ?? data.examMidterm);
      const finalScore = toNumber(data.finalScore ?? data.finalExam ?? data.examFinal);
      const currentTotal = toNumber(
        data.currentTotal ?? data.totalScore ?? (midtermScore + finalScore + practiceTotal)
      );

      setResult({
        ...data,
        practiceTotal,
        midtermScore,
        finalScore,
        currentTotal
      });
    } catch (err) {
      setError('조회 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStudentId('');
    setResult(null);
    setError('');
    setNotFound(false);
  };

  useEffect(() => {
    const handleEnterReset = (event) => {
      if (event.key === 'Enter' && result) {
        event.preventDefault();
        handleReset();
      }
    };

    window.addEventListener('keydown', handleEnterReset);
    return () => window.removeEventListener('keydown', handleEnterReset);
  }, [result]);

  return (
    <div className="student-lookup">
      <div className="lookup-panel">
        <h1>학생 성적 조회</h1>
        <p className="description">학번을 입력하여 현재 성적을 확인하세요.</p>

        {!result ? (
          <form onSubmit={handleLookup} className="lookup-form">
            <div className="input-group">
              <label htmlFor="studentId">학번</label>
              <input
                id="studentId"
                type="text"
                placeholder="예: 2026001"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div className={`alert ${notFound ? 'not-found' : 'error'}`}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '조회 중...' : '성적 조회'}
            </button>
          </form>
        ) : (
          <div className="result-panel">
            <h2>조회 결과</h2>

            <div className="student-info">
              <div className="info-row">
                <span className="label">학번</span>
                <span className="value">{result.studentId}</span>
              </div>
              <div className="info-row">
                <span className="label">이름</span>
                <span className="value">{result.name}</span>
              </div>
              <div className="info-row">
                <span className="label">반</span>
                <span className="value">{result.studentClass}</span>
              </div>
              <div className="info-row">
                <span className="label">교시</span>
                <span className="value">{result.session}</span>
              </div>
            </div>

            <div className="score-panel">
              <h3>성적 요약</h3>
              <div className="score-row">
                <div className="score-item">
                  <span className="score-label">중간</span>
                  <span className="score-value">{result.midtermScore}</span>
                </div>
                <div className="score-item">
                  <span className="score-label">기말</span>
                  <span className="score-value">{result.finalScore}</span>
                </div>
                <div className="score-item">
                  <span className="score-label">실습총점</span>
                  <span className={`score-value ${result.practiceTotal >= 0 ? 'plus' : 'minus'}`}>
                    {result.practiceTotal}
                  </span>
                </div>
                <div className="score-item highlight">
                  <span className="score-label">현재총점</span>
                  <span className="score-value final">{result.currentTotal}</span>
                </div>
              </div>
            </div>

            <button type="button" className="btn btn-secondary" onClick={handleReset}>
              초기화
            </button>
          </div>
        )}
      </div>

      <div className="footer-note">
        <p>
          📌 <strong>주의:</strong> 이 페이지는 학생 본인의 성적만 조회할 수 있습니다.
          다른 학생의 정보는 조회할 수 없습니다.
        </p>
      </div>
    </div>
  );
}

export default StudentLookup;
