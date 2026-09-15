import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
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
googleProvider.addScope('https://www.googleapis.com/auth/forms.body');
googleProvider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');
// Forms are Drive files under the hood; Forms API calls require this alongside the forms.* scopes.
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

// Google OAuth access token (from GoogleAuthProvider.credentialFromResult), needed for
// direct Forms API calls. Firebase Auth's ID token is separate and cannot be used here.
// Only available right after signInWithPopup and expires after ~1h; if a Forms API call
// fails with 401, the admin needs to sign in again to refresh it.
let googleAccessToken = null;

export function setGoogleAccessToken(token) {
  googleAccessToken = token;
}

export function getGoogleAccessToken() {
  return googleAccessToken;
}

// Re-runs the Google sign-in popup to refresh the access token (it isn't persisted across
// reloads and expires after ~1h). The admin stays on the same account; this doesn't sign out.
export async function reauthorizeGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken || null;
  setGoogleAccessToken(token);
  return token;
}
