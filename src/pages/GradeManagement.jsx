import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../firebase';
import WeeklyClassComments from './WeeklyClassComments';
import MidtermUpload from './MidtermUpload';
import QuizTotalUpload from './QuizTotalUpload';
import './GradeManagement.css';

export default function GradeManagement({ termId }) {
  const [students, setStudents] = useState([]);
  const [practiceTotals, setPracticeTotals] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (termId) loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termId]);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'terms', termId, 'enrollments'), limit(500));
      const snapshot = await getDocs(q);
      setStudents(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));

      // 평소점수: scoreRecords를 학생별로 합산
      const scoreSnap = await getDocs(
        query(collection(db, 'terms', termId, 'scoreRecords'), limit(5000))
      );
      const totals = {};
      scoreSnap.docs.forEach(d => {
        const { studentId, score, ignored } = d.data();
        if (ignored) return;
        const num = Number(score);
        totals[studentId] = (totals[studentId] || 0) + (Number.isFinite(num) ? num : 0);
      });
      setPracticeTotals(totals);
    } catch (error) {
      console.error('학생 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const esc = v => {
      const s = String(v ?? '');
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['학번', '이름', '반', '조', '출석', '중간', '기말', '평소(전체 합산)'];
    const rows = students.map(s => [
      s.studentId, s.name, s.studentClass, s.group, s.attendanceScore,
      s.midtermScore, s.finalExamScore,
      Math.round((practiceTotals[s.studentId] || 0) * 100) / 100,
    ]);
    const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    // BOM: 엑셀에서 한글 깨짐 방지
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `성적_전체_${termId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grade-management">
      <div className="notice-banner">
        📌 출석/중간/기말 성적 <strong>엑셀 업로드</strong> 기능은 형식이 확정되면 지원할 예정입니다.
        아래는 현재까지 입력된 값(있는 경우)을 확인하는 용도입니다.
      </div>

      <MidtermUpload termId={termId} onSaved={loadStudents} />
      <QuizTotalUpload termId={termId} onSaved={loadStudents} />

      {loading && <p className="loading">로딩 중...</p>}

      <div style={{ margin: '12px 0' }}>
        <button type="button" onClick={exportCsv} disabled={loading || students.length === 0}>
          📥 전체 자료 CSV 내보내기
        </button>
      </div>

      <div className="table-wrapper">
        <table className="students-table">
          <thead>
            <tr>
              <th>학번</th>
              <th>이름</th>
              <th>반</th>
              <th>조</th>
              <th>출석</th>
              <th>중간</th>
              <th>기말</th>
              <th>평소(전체 합산)</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id}>
                <td>{s.studentId}</td>
                <td>{s.name}</td>
                <td>{s.studentClass}</td>
                <td>{s.group ?? '-'}</td>
                <td>{s.attendanceScore ?? '-'}</td>
                <td>{s.midtermScore ?? '-'}</td>
                <td>{s.finalExamScore ?? '-'}</td>
                <td>{Math.round((practiceTotals[s.studentId] || 0) * 100) / 100}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WeeklyClassComments termId={termId} />
    </div>
  );
}
