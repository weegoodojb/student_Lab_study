import React, { useState, useRef, useEffect } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import './RouletteTab.css';

const TABLE_COUNT = 6;
const TABLE_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad'];

function buildRandomAssignment() {
  const tables = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);
  for (let i = tables.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tables[i], tables[j]] = [tables[j], tables[i]];
  }
  return tables;
}

function assignmentToText(assignments) {
  return assignments
    .map((table, idx) => `${idx + 1}조-테이블${table}`)
    .join(', ');
}

export default function RouletteTab({ termId, classFormationCount }) {
  const [selectedClass, setSelectedClass] = useState(1);
  const [spinning, setSpinning] = useState(false);
  const [displayAssignment, setDisplayAssignment] = useState(() => buildRandomAssignment());
  const [resultAssignment, setResultAssignment] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (termId) loadHistory(selectedClass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId, selectedClass]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const loadHistory = async (cls) => {
    try {
      setLoadingHistory(true);
      const q = query(
        collection(db, 'terms', termId, 'rouletteHistory'),
        orderBy('createdAt', 'desc'),
        limit(200)
      );
      const snapshot = await getDocs(q);
      const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(all.filter(h => h.studentClass === cls));
    } catch (err) {
      console.error('이력 로드 실패:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setResultAssignment(null);
    setShowResult(false);

    const finalResult = buildRandomAssignment();
    const totalDuration = 5000;

    // 지수 감속 스케줄 (50ms → 650ms)
    const delays = [];
    let t = 0;
    while (t < totalDuration) {
      const progress = t / totalDuration;
      const delay = Math.round(50 + Math.pow(progress, 2) * 600);
      if (t + delay > totalDuration) break;
      delays.push(delay);
      t += delay;
    }

    let tick = 0;

    const next = () => {
      if (tick >= delays.length) {
        setDisplayAssignment(finalResult);
        timeoutRef.current = setTimeout(() => {
          setSpinning(false);
          setResultAssignment(finalResult);
          setShowResult(true);
          saveHistory(finalResult);
        }, 400);
        return;
      }
      setDisplayAssignment(buildRandomAssignment());
      timeoutRef.current = setTimeout(next, delays[tick]);
      tick++;
    };

    next();
  };

  const saveHistory = async (assignments) => {
    try {
      await addDoc(collection(db, 'terms', termId, 'rouletteHistory'), {
        studentClass: selectedClass,
        assignments,
        resultText: assignmentToText(assignments),
        createdAt: serverTimestamp()
      });
      await loadHistory(selectedClass);
    } catch (err) {
      console.error('이력 저장 실패:', err);
    }
  };

  const deleteHistoryItem = async (id) => {
    try {
      await deleteDoc(doc(db, 'terms', termId, 'rouletteHistory', id));
      setHistory(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('삭제 실패:', err);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '방금';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('ko-KR', {
      month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="roulette-tab">
      {/* 반 선택 */}
      <div className="class-selector-row">
        {Array.from({ length: classFormationCount }, (_, i) => i + 1).map(cls => (
          <button
            key={cls}
            className={`class-pill ${selectedClass === cls ? 'active' : ''}`}
            onClick={() => {
              if (!spinning) {
                setSelectedClass(cls);
                setResultAssignment(null);
                setShowResult(false);
              }
            }}
          >
            {cls}반
          </button>
        ))}
      </div>

      {/* 룰렛 메인 */}
      <div className="roulette-stage">
        <div className={`assignment-board ${spinning ? 'spinning' : ''} ${showResult ? 'reveal' : ''}`}>
          <div className="board-title">{selectedClass}반 조-테이블 배정</div>
          <div className="assignment-grid">
            {displayAssignment.map((table, idx) => (
              <div key={idx} className="assignment-card" style={{ '--card-color': TABLE_COLORS[(table - 1) % TABLE_COLORS.length] }}>
                <span className="assignment-group">{idx + 1}조</span>
                <span className="assignment-arrow">→</span>
                <span className="assignment-table">테이블 {table}</span>
              </div>
            ))}
          </div>
        </div>

        {showResult && (
          <div className="result-banner">
            🎉 {assignmentToText(resultAssignment || [])}
          </div>
        )}

        <button
          className={`spin-btn ${spinning ? 'active' : ''}`}
          onClick={spin}
          disabled={spinning}
        >
          {spinning ? '🎲 추첨 중...' : '🎰 룰렛 시작'}
        </button>
      </div>

      {/* 이력 */}
      <div className="history-panel">
        <div className="history-header">
          <h4>📋 {selectedClass}반 추첨 이력 ({history.length}건)</h4>
          <button
            className="refresh-btn"
            onClick={() => loadHistory(selectedClass)}
            disabled={loadingHistory}
          >
            🔄
          </button>
        </div>

        {history.length === 0 ? (
          <p className="no-history">추첨 이력이 없습니다.</p>
        ) : (
          <div className="history-list">
            {history.map((h, idx) => (
              <div key={h.id} className="history-item">
                <span className="h-rank">#{history.length - idx}</span>
                <span className="h-map">{h.resultText || assignmentToText(h.assignments || [])}</span>
                <span className="h-time">{formatTime(h.createdAt)}</span>
                <button className="h-delete" onClick={() => deleteHistoryItem(h.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
