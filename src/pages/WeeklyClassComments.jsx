import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const WEEKS = Array.from({ length: 15 }, (_, i) => `${i + 1}주차`);

// 수업 전체에 대한 주차별 코멘트. terms/{termId} 문서의 weeklyComments 맵에 저장한다.
export default function WeeklyClassComments({ termId }) {
  const [comments, setComments] = useState({});
  const [week, setWeek] = useState(WEEKS[0]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!termId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'terms', termId));
        const loaded = snap.data()?.weeklyComments || {};
        setComments(loaded);
        setDraft(loaded[WEEKS[0]] || '');
        setWeek(WEEKS[0]);
      } catch (err) {
        console.error('주차별 코멘트 로드 실패:', err);
        setMessage(`❌ 코멘트 로드 실패: ${err.message}`);
      }
    })();
  }, [termId]);

  const changeWeek = (next) => {
    setWeek(next);
    setDraft(comments[next] || '');
    setMessage('');
  };

  const save = async () => {
    try {
      setSaving(true);
      const text = draft.trim();
      const next = { ...comments };
      if (text) next[week] = text;
      else delete next[week];
      await updateDoc(doc(db, 'terms', termId), { weeklyComments: next, updatedAt: new Date() });
      setComments(next);
      setMessage(`✅ ${week} 코멘트 ${text ? '저장' : '삭제'} 완료`);
    } catch (err) {
      console.error('주차별 코멘트 저장 실패:', err);
      setMessage(`❌ 저장 실패: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="input-section">
      <div className="form-group">
        <label>🗓️ 주차별 수업 코멘트</label>
        <select value={week} onChange={(e) => changeWeek(e.target.value)}>
          {WEEKS.map(w => (
            <option key={w} value={w}>{w}{comments[w] ? ' ●' : ''}</option>
          ))}
        </select>
        <textarea
          rows={5}
          placeholder="이번 주 수업 전체에 대한 코멘트 (비우고 저장하면 삭제)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
      <button className="save-btn" onClick={save} disabled={saving || !termId}>
        {saving ? '저장 중...' : `💾 ${week} 코멘트 저장`}
      </button>
      {message && <div className="message">{message}</div>}
      {Object.keys(comments).length > 0 && (
        <ul>
          {Object.entries(comments)
            .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
            .map(([w, text]) => <li key={w}><strong>{w}</strong> {text}</li>)}
        </ul>
      )}
    </div>
  );
}
