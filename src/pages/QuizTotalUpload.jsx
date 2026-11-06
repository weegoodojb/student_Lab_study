import { useState } from 'react';
import { collection, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// 업로드 JSON 형식: { records: [{ studentId, name, score }] }
const normName = (n) => String(n || '').trim().replace(/\*$/, '');
// WeeklyQuizScoreTable.jsx 의 getWeek 와 동일한 기준
const isWeeklyReason = (reason) => {
  const t = String(reason || '');
  return /^\s*\d+\s*주차\s*퀴즈(?:\s|$)/.test(t) || /neisseria|moraxella/i.test(t) || /gram[\s-]*positive/i.test(t);
};

export default function QuizTotalUpload({ termId, onSaved }) {
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage('');
    setPreview(null);
    try {
      const parsed = JSON.parse(await file.text());
      const [enrSnap, scoreSnap] = await Promise.all([
        getDocs(collection(db, 'terms', termId, 'enrollments')),
        getDocs(collection(db, 'terms', termId, 'scoreRecords'))
      ]);
      const roster = new Map(enrSnap.docs.map(d => [String(d.data().studentId), d.data()]));

      const ok = [];
      const unmatched = [];
      for (const r of parsed.records || []) {
        const enr = roster.get(String(r.studentId));
        if (!enr) {
          unmatched.push(`${r.studentId} ${r.name}: 명단에 없는 학번`);
        } else if (normName(enr.name) !== normName(r.name)) {
          unmatched.push(`${r.studentId}: 이름 불일치 (파일 ${r.name} / 명단 ${enr.name})`);
        } else {
          ok.push({ score: Number(r.score), enr });
        }
      }
      const uploaded = new Set(ok.map(r => String(r.enr.studentId)));
      const missing = [...roster.values()]
        .filter(s => !uploaded.has(String(s.studentId)))
        .map(s => `${s.studentId} ${normName(s.name)} (${s.studentClass}반)`);

      const records = scoreSnap.docs;
      const toIgnore = records.filter(d => {
        const x = d.data();
        return !x.ignored && x.inputType !== 'quizTotal' && isWeeklyReason(x.reason);
      });
      const oldTotals = records.filter(d => d.data().inputType === 'quizTotal');

      setPreview({ ok, unmatched, missing, toIgnore, oldTotals });
    } catch (err) {
      console.error('합산 파일 읽기 실패:', err);
      setMessage(`❌ 파일 읽기 실패: ${err.message}`);
    }
  };

  const save = async () => {
    if (!preview?.ok.length) return;
    if (!window.confirm(
      `기존 주차별 기록 ${preview.toIgnore.length}건을 합산에서 제외(ignored)하고, ` +
      `주차별 퀴즈 합산 ${preview.ok.length}건을 추가합니다. 계속할까요?`
    )) return;
    try {
      setSaving(true);
      const ref = collection(db, 'terms', termId, 'scoreRecords');
      const ops = [
        ...preview.toIgnore.map(d => (b) => b.update(d.ref, { ignored: true })),
        ...preview.oldTotals.map(d => (b) => b.delete(d.ref)),
        ...preview.ok.map(r => (b) => b.set(doc(ref), {
          studentId: r.enr.studentId,
          name: r.enr.name,
          studentClass: r.enr.studentClass,
          group: r.enr.group ?? null,
          score: r.score,
          reason: '주차별 퀴즈 합산',
          reasonCode: '',
          inputType: 'quizTotal',
          createdAt: Timestamp.now()
        }))
      ];
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach(fn => fn(batch));
        await batch.commit();
      }
      setMessage(`✅ 합산 ${preview.ok.length}건 저장, 기존 주차별 ${preview.toIgnore.length}건 제외 완료`);
      setPreview(null);
      onSaved?.();
    } catch (err) {
      console.error('합산 저장 실패:', err);
      setMessage(`❌ 저장 실패: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="input-section">
      <div className="form-group">
        <label>📥 주차별 퀴즈 합산 점수 업로드 (JSON)</label>
        <input type="file" accept=".json" onChange={handleFile} />
      </div>

      {preview && (
        <div className="student-list">
          <p className="list-title">저장 가능 {preview.ok.length}명</p>
          <p className="list-title">합산에서 제외할 기존 주차별 기록 {preview.toIgnore.length}건 (삭제 아님)</p>
          <p className="list-title">매칭 안 되는 학생 {preview.unmatched.length}명 (저장 제외)</p>
          <ul>{preview.unmatched.map(p => <li key={p}>{p}</li>)}</ul>
          <p className="list-title">파일에 없는 명단 학생 {preview.missing.length}명</p>
          <ul>{preview.missing.map(m => <li key={m}>{m}</li>)}</ul>
          <button className="save-btn" onClick={save} disabled={saving || !preview.ok.length}>
            {saving ? '저장 중...' : `💾 ${preview.ok.length}명 저장`}
          </button>
        </div>
      )}

      {message && <div className="message">{message}</div>}
    </div>
  );
}
