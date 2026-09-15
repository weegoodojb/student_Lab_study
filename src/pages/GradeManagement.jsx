import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../firebase';
import './GradeManagement.css';

export default function GradeManagement({ termId }) {
  const [students, setStudents] = useState([]);
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
    } catch (error) {
      console.error('학생 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grade-management">
      <div className="notice-banner">
        📌 출석/중간/기말 성적 <strong>엑셀 업로드</strong> 기능은 형식이 확정되면 지원할 예정입니다.
        아래는 현재까지 입력된 값(있는 경우)을 확인하는 용도입니다.
      </div>

      {loading && <p className="loading">로딩 중...</p>}

      <div className="table-wrapper">
        <table className="students-table">
          <thead>
            <tr>
              <th>학번</th>
              <th>이름</th>
              <th>반</th>
              <th>출석</th>
              <th>중간</th>
              <th>기말</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id}>
                <td>{s.studentId}</td>
                <td>{s.name}</td>
                <td>{s.studentClass}</td>
                <td>{s.attendanceScore ?? '-'}</td>
                <td>{s.midtermScore ?? '-'}</td>
                <td>{s.finalExamScore ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
