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

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

// crypto.subtle은 HTTPS/localhost에서만 존재하므로, http(IP 접속) 환경용 순수 JS SHA-256
function sha256Hex(bytes) {
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((bytes.length * 8) / 0x100000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);

  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
}

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256Hex(data);
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
    const practiceTotal = snapshot.docs.reduce(
      (sum, item) => (item.data().ignored ? sum : sum + toNumber(item.data().score)),
      0
    );

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
