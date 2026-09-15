import { useState } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import './StudentKiosk.css';

const STAGE = {
  ENTER_ID: 'enterId',
  SET_PIN: 'setPin',
  ENTER_PIN: 'enterPin',
  RESULT: 'result'
};

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export default function StudentKiosk({ termId }) {
  const [stage, setStage] = useState(STAGE.ENTER_ID);
  const [studentId, setStudentId] = useState('');
  const [enrollment, setEnrollment] = useState(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetAll = () => {
    setStage(STAGE.ENTER_ID);
    setStudentId('');
    setEnrollment(null);
    setPin('');
    setPinConfirm('');
    setResult(null);
    setError('');
  };

  const handleLookupId = async e => {
    e.preventDefault();
    setError('');
    const id = studentId.trim();
    if (!id) {
      setError('학번을 입력하세요.');
      return;
    }
    if (!termId) {
      setError('선택된 학기가 없습니다.');
      return;
    }

    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'terms', termId, 'enrollments', id));
      if (!snap.exists()) {
        setError(`학번 ${id}의 정보를 찾을 수 없습니다.`);
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      setEnrollment(data);
      setStage(data.pinHash ? STAGE.ENTER_PIN : STAGE.SET_PIN);
    } catch (err) {
      setError('조회 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async e => {
    e.preventDefault();
    setError('');

    if (!/^\d{4}$/.test(pin)) {
      setError('4자리 숫자로 입력하세요.');
      return;
    }
    if (pin !== pinConfirm) {
      setError('입력한 코드가 서로 일치하지 않습니다.');
      return;
    }

    try {
      setLoading(true);
      const pinHash = await hashPin(pin);
      await updateDoc(doc(db, 'terms', termId, 'enrollments', enrollment.id), {
        pinHash,
        pinSetAt: new Date()
      });
      await showResult(enrollment.id);
    } catch (err) {
      setError('코드 설정 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPin = async e => {
    e.preventDefault();
    setError('');

    if (!/^\d{4}$/.test(pin)) {
      setError('4자리 숫자로 입력하세요.');
      return;
    }

    try {
      setLoading(true);
      const inputHash = await hashPin(pin);
      if (inputHash !== enrollment.pinHash) {
        setError('코드가 일치하지 않습니다.');
        setPin('');
        return;
      }
      await showResult(enrollment.id);
    } catch (err) {
      setError('확인 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const showResult = async id => {
    const q = query(collection(db, 'terms', termId, 'scoreRecords'), where('studentId', '==', id));
    const snapshot = await getDocs(q);
    const practiceTotal = snapshot.docs.reduce((sum, item) => sum + toNumber(item.data().score), 0);

    const midtermScore = toNumber(enrollment.midtermScore);
    const finalExamScore = toNumber(enrollment.finalExamScore);
    const currentTotal = midtermScore + finalExamScore + practiceTotal;

    setResult({ practiceTotal, midtermScore, finalExamScore, currentTotal });
    setStage(STAGE.RESULT);
  };

  return (
    <div className="kiosk">
      <div className="kiosk-panel">
        <h2>학생 성적 조회</h2>

        {stage === STAGE.ENTER_ID && (
          <form onSubmit={handleLookupId} className="kiosk-form">
            <p className="description">학번을 입력하세요.</p>
            <input
              type="text"
              placeholder="예: 2026001"
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              disabled={loading}
              autoFocus
            />
            {error && <div className="alert">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '조회 중...' : '조회'}
            </button>
          </form>
        )}

        {stage === STAGE.SET_PIN && (
          <form onSubmit={handleSetPin} className="kiosk-form">
            <p className="description">
              <strong>{enrollment.name}</strong>님, 처음 조회하시는군요! 본인 확인용 4자리 코드를 설정하세요.
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4자리 코드"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="코드 다시 입력"
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
            />
            {error && <div className="alert">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '설정 중...' : '코드 설정'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetAll}>
              취소
            </button>
          </form>
        )}

        {stage === STAGE.ENTER_PIN && (
          <form onSubmit={handleVerifyPin} className="kiosk-form">
            <p className="description">
              <strong>{enrollment.name}</strong>님, 본인 확인 코드 4자리를 입력하세요.
            </p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="4자리 코드"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            {error && <div className="alert">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '확인 중...' : '확인'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetAll}>
              취소
            </button>
          </form>
        )}

        {stage === STAGE.RESULT && result && (
          <div className="kiosk-result">
            <div className="result-header">
              <span>{enrollment.name}</span>
              <span>{enrollment.studentClass}반 · {enrollment.session}교시</span>
            </div>

            <div className="score-row">
              <div className="score-item">
                <span className="score-label">중간</span>
                <span className="score-value">{result.midtermScore}</span>
              </div>
              <div className="score-item">
                <span className="score-label">기말</span>
                <span className="score-value">{result.finalExamScore}</span>
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

            <button type="button" className="btn btn-secondary" onClick={resetAll}>
              처음으로
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
