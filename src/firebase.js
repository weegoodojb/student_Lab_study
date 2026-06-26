import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAUB_rRig9w-5YCr3qqKopKJ21E_XGzR8w',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    'student-practice-mgmt.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'student-practice-mgmt',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'student-practice-mgmt.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1075088626549',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:1075088626549:web:db23e1f9545781c052393c'
};

export const ADMIN_EMAIL =
  (import.meta.env.VITE_ADMIN_EMAIL || 'goodojb@gmail.com').toLowerCase();

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
