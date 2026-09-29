import React, { useState } from 'react';
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';

// 업로드 JSON 형식: { records: [{ studentId, name, score, reason, submittedAt }] }
const normName = (n) => String(n || '').trim().replace(/\*$/, '');

export default function BulkScoreUpload({ termId }) {
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
      const snapshot = await getDocs(collection(db, 'terms', termId, 'enrollments'));
      const roster = new Map(snapshot.docs.map(d => [d.data().studentId, d.data()]));

      const ok = [];
      const problems = [];
      for (const r of parsed.records || []) {
        const enr = roster.get(String(r.studentId));
        if (!enr) {
          problems.push(`${r.studentId} ${r.name}: 명단에 없는 학번`);
        } else if (normName(enr.name) !== normName(r.name)) {
          problems.push(`${r.studentId}: 이름 불일치 (파일 ${r.name} / 명단 ${enr.name})`);
        } else {
          ok.push({ ...r, enr });
        }
      }
      const submitted = new Set(ok.map(r => String(r.studentId)));
      const missing = [...roster.values()]
        .filter(s => !submitted.has(s.studentId))
        .map(s => `${s.studentId} ${normName(s.name)} (${s.studentClass}반 ${s.group ?? '-'}조)`);

      setPreview({ ok, problems, missing });
    } catch (err) {
      console.error('업로드 파일 읽기 실패:', err);
      setMessage(`❌ 파일 읽기 실패: ${err.message}`);
    }
  };

  const save = async () => {
    if (!preview?.ok.length) return;
    try {
      setSaving(true);
      const ref = collection(db, 'terms', termId, 'scoreRecords');
      // 배치당 최대 500건
      for (let i = 0; i < preview.ok.length; i += 400) {
        const batch = writeBatch(db);
        preview.ok.slice(i, i + 400).forEach(r => {
          batch.set(doc(ref), {
            studentId: r.enr.studentId,
            name: r.enr.name,
            studentClass: r.enr.studentClass,
            group: r.enr.group ?? null,
            score: r.score,
            reason: r.reason,
            reasonCode: '',
            inputType: 'individual',
            createdAt: Timestamp.fromDate(new Date(r.submittedAt))
          });
        });
        await batch.commit();
      }
      setMessage(`✅ ${preview.ok.length}건 저장 완료`);
      setPreview(null);
    } catch (err) {
      console.error('일괄 저장 실패:', err);
      setMessage(`❌ 저장 실패: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="input-section">
      <div className="form-group">
        <label>📥 일괄 업로드 (JSON)</label>
        <input type="file" accept=".json" onChange={handleFile} />
      </div>

      {preview && (
        <div className="student-list">
          <p className="list-title">저장 가능 {preview.ok.length}건</p>
          {preview.problems.length > 0 && (
            <>
              <p className="list-title">검증 실패 {preview.problems.length}건 (저장 제외)</p>
              <ul>{preview.problems.map(p => <li key={p}>{p}</li>)}</ul>
            </>
          )}
          <p className="list-title">미제출 {preview.missing.length}명</p>
          <ul>{preview.missing.map(m => <li key={m}>{m}</li>)}</ul>
          <button className="save-btn" onClick={save} disabled={saving || !preview.ok.length}>
            {saving ? '저장 중...' : `💾 ${preview.ok.length}건 저장`}
          </button>
        </div>
      )}

      {message && <div className="message">{message}</div>}
    </div>
  );
}
