import { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import './App.css';
import { ADMIN_EMAIL, auth, googleProvider } from './firebase';
import StudentLookup from './pages/StudentLookup';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  const [mode, setMode] = useState(null); // null: select, 'admin': admin mode, 'student': student mode
  const [user, setUser] = useState(null);
  const [adminStatus, setAdminStatus] = useState('로그인이 필요합니다.');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async nextUser => {
      if (!nextUser) {
        setUser(null);
        setAdminStatus('로그인이 필요합니다.');
        return;
      }

      const email = String(nextUser.email || '').toLowerCase();
      if (email !== ADMIN_EMAIL) {
        await signOut(auth);
        setUser(null);
        setAdminStatus('권한 없는 계정입니다. 관리자 계정으로 로그인해주세요.');
        return;
      }

      setUser(nextUser);
      setAdminStatus('관리자 인증 완료');
    });

    return () => unsubscribe();
  }, []);

  const userName = useMemo(() => {
    if (!user) return '';
    return user.displayName || user.email || '관리자';
  }, [user]);

  const handleAdminClick = () => {
    setMode('admin');
  };

  const handleStudentClick = () => {
    setMode('student');
  };

  const handleBackToMode = () => {
    setMode(null);
  };

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setAdminStatus('Google 로그인 진행 중...');
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAdminStatus('로그인 실패: ' + (error.message || '알 수 없는 오류'));
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setAdminStatus('로그아웃되었습니다.');
      setMode(null);
    } catch (error) {
      setAdminStatus('로그아웃 실패: ' + (error.message || '알 수 없는 오류'));
    }
  };

  // 모드 선택 화면
  if (mode === null) {
    return (
      <main className="page">
        <section className="panel hero">
          <p className="eyebrow">학생 실습 관리 시스템</p>
          <h1>이용 모드 선택</h1>
          <p className="description">
            귀하의 역할에 맞는 모드를 선택하세요.
          </p>

          <div className="mode-buttons">
            <button
              type="button"
              className="mode-btn admin-mode"
              onClick={handleAdminClick}
            >
              <span className="mode-icon">👨‍💼</span>
              <span className="mode-title">관리자</span>
              <span className="mode-desc">학생 정보 관리 및 성적 기록</span>
            </button>

            <button
              type="button"
              className="mode-btn student-mode"
              onClick={handleStudentClick}
            >
              <span className="mode-icon">👤</span>
              <span className="mode-title">학생</span>
              <span className="mode-desc">자신의 성적 조회</span>
            </button>
          </div>
        </section>
      </main>
    );
  }

  // 학생 모드
  if (mode === 'student') {
    return (
      <div>
        <button
          type="button"
          className="back-btn"
          onClick={handleBackToMode}
          style={{
            position: 'fixed',
            top: '20px',
            left: '20px',
            zIndex: 1000,
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid #d5d8d2',
            borderRadius: '8px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#2f3c25',
            fontWeight: '600'
          }}
        >
          ← 돌아가기
        </button>
        <StudentLookup />
      </div>
    );
  }

  // 관리자 모드
  return (
    <main className="page">
      <button
        type="button"
        className="back-btn"
        onClick={handleBackToMode}
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 1000,
          background: 'rgba(255,255,255,0.9)',
          border: '1px solid #d5d8d2',
          borderRadius: '8px',
          padding: '8px 12px',
          cursor: 'pointer',
          fontSize: '14px',
          color: '#2f3c25',
          fontWeight: '600'
        }}
      >
        ← 돌아가기
      </button>

      <section className="panel admin-auth-compact">
        <div className="auth-head">
          <p className="eyebrow">관리자 인증</p>
          <p className="auth-allowed">허용 계정: <strong>{ADMIN_EMAIL}</strong></p>
        </div>

        <p className="status compact" aria-live="polite">
          {loading ? '인증 상태 확인 중...' : adminStatus}
        </p>

        {!user ? (
          <button type="button" className="btn btn-primary auth-login-btn" onClick={handleSignIn}>
            Google 로그인
          </button>
        ) : (
          <div className="auth-inline">
            <span><strong>{userName}</strong> · {user.email}</span>
            <button type="button" className="btn btn-outline auth-logout-btn" onClick={handleSignOut}>
              로그아웃
            </button>
          </div>
        )}
      </section>

      {user && (
        <section className="panel">
          <AdminDashboard />
        </section>
      )}
    </main>
  );
}

export default App;
