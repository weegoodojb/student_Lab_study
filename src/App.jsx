import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import './App.css';
import { ADMIN_EMAIL, auth, reauthorizeGoogle, setGoogleAccessToken } from './firebase';
import AdminDashboard from './pages/AdminDashboard';

function App() {
  const [user, setUser] = useState(null);
  const [adminStatus, setAdminStatus] = useState('로그인이 필요합니다.');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async nextUser => {
      if (!nextUser) {
        setUser(null);
        setAdminStatus('로그인이 필요합니다.');
        setLoading(false);
        return;
      }

      const email = String(nextUser.email || '').toLowerCase();
      if (email !== ADMIN_EMAIL) {
        await signOut(auth);
        setUser(null);
        setAdminStatus('권한 없는 계정입니다. 관리자 계정으로 로그인해주세요.');
        setLoading(false);
        return;
      }

      setUser(nextUser);
      setAdminStatus('관리자 인증 완료');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const userName = useMemo(() => {
    if (!user) return '';
    return user.displayName || user.email || '관리자';
  }, [user]);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setAdminStatus('Google 로그인 진행 중...');
      await reauthorizeGoogle();
    } catch (error) {
      setAdminStatus('로그인 실패: ' + (error.message || '알 수 없는 오류'));
      setLoading(false);
    }
  };

  const handleReauth = async () => {
    try {
      await reauthorizeGoogle();
      setAdminStatus('Google 인증을 다시 받았습니다.');
    } catch (error) {
      setAdminStatus('재인증 실패: ' + (error.message || '알 수 없는 오류'));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setGoogleAccessToken(null);
      setAdminStatus('로그아웃되었습니다.');
    } catch (error) {
      setAdminStatus('로그아웃 실패: ' + (error.message || '알 수 없는 오류'));
    }
  };

  const showStatusLine = loading || !user || (adminStatus !== '관리자 인증 완료' && adminStatus !== '로그인이 필요합니다.');

  return (
    <main className="page">
      {user && (
        <section className="panel">
          <AdminDashboard />
        </section>
      )}

      <section className="panel admin-auth-compact">
        {!user ? (
          <>
            <div className="auth-head">
              <p className="eyebrow">관리자 인증</p>
              <p className="auth-allowed">허용 계정: <strong>{ADMIN_EMAIL}</strong></p>
            </div>
            <p className="status compact" aria-live="polite">
              {loading ? '인증 상태 확인 중...' : adminStatus}
            </p>
            <button type="button" className="btn btn-primary auth-login-btn" onClick={handleSignIn}>
              Google 로그인
            </button>
          </>
        ) : (
          <>
            <div className="auth-inline">
              <span><strong>{userName}</strong> · {user.email}</span>
              <div className="auth-inline-actions">
                <button type="button" className="btn-small" onClick={handleReauth}>
                  Google 재인증
                </button>
                <button type="button" className="btn btn-outline auth-logout-btn" onClick={handleSignOut}>
                  로그아웃
                </button>
              </div>
            </div>
            {showStatusLine && (
              <p className="status compact" aria-live="polite">
                {loading ? '인증 상태 확인 중...' : adminStatus}
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default App;
