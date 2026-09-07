import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isConfigured: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  loginWithGoogle: () => Promise<{ error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isConfigured = isFirebaseConfigured();

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
        } catch (e) {
          console.error('Error fetching Firebase ID token:', e);
          setToken(null);
        }
      } else {
        setToken(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [isConfigured]);

  const login = async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) {
      return { error: 'Chưa cấu hình Firebase API Key và Project ID trong biến môi trường.' };
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setUser(cred.user);
      const idToken = await cred.user.getIdToken();
      setToken(idToken);
      return {};
    } catch (err: any) {
      let message = err.message || 'Đăng nhập thất bại';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        message = 'Email hoặc mật khẩu không chính xác.';
      } else if (err.code === 'auth/user-not-found') {
        message = 'Không tìm thấy tài khoản với email này.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Quá nhiều lần thử thất bại. Vui lòng thử lại sau ít phút.';
      } else if (err.code === 'auth/operation-not-allowed') {
        message = 'auth/operation-not-allowed: Phương thức Email/Mật khẩu chưa được BẬT trong Firebase Console.';
      }
      return { error: message };
    }
  };

  const loginWithGoogle = async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      return { error: 'Chưa cấu hình Firebase.' };
    }

    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);

      const db = getFirebaseDb();
      if (db) {
        try {
          const userRef = doc(db, 'users', cred.user.uid);
          await setDoc(userRef, {
            uid: cred.user.uid,
            email: cred.user.email,
            displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
            photoURL: cred.user.photoURL || null,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (dbErr) {
          console.warn('Firestore user profile save notice:', dbErr);
        }
      }

      setUser(cred.user);
      const idToken = await cred.user.getIdToken();
      setToken(idToken);
      return {};
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        return { error: 'Cửa sổ đăng nhập Google đã bị đóng.' };
      }
      return { error: err.message || 'Đăng nhập Google thất bại' };
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    const auth = getFirebaseAuth();
    if (!auth) {
      return { error: 'Chưa cấu hình Firebase API Key và Project ID trong biến môi trường.' };
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const displayName = name || email.split('@')[0];

      await updateProfile(cred.user, { displayName });

      // Save user to Firestore users collection
      const db = getFirebaseDb();
      if (db) {
        try {
          const userRef = doc(db, 'users', cred.user.uid);
          await setDoc(userRef, {
            uid: cred.user.uid,
            email: cred.user.email,
            displayName,
            photoURL: cred.user.photoURL || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (dbErr) {
          console.warn('Firestore user profile save notice:', dbErr);
        }
      }

      setUser(cred.user);
      const idToken = await cred.user.getIdToken();
      setToken(idToken);
      return {};
    } catch (err: any) {
      let message = err.message || 'Đăng ký thất bại';
      if (err.code === 'auth/email-already-in-use') {
        message = 'Email này đã được sử dụng bởi một tài khoản khác.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Mật khẩu quá yếu (tối thiểu 6 ký tự).';
      } else if (err.code === 'auth/operation-not-allowed') {
        message = 'auth/operation-not-allowed: Phương thức Email/Mật khẩu chưa được BẬT trong Firebase Console.';
      }
      return { error: message };
    }
  };

  const logout = async () => {
    const auth = getFirebaseAuth();
    if (auth) {
      await signOut(auth);
    }
    setUser(null);
    setToken(null);
  };

  /**
   * Authenticated API helper sending Firebase ID Token in Authorization Bearer
   */
  const apiFetch = async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});

    let currentToken = token;
    if (user) {
      try {
        currentToken = await user.getIdToken();
        setToken(currentToken);
      } catch (e) {
        console.error('Error refreshing token for apiFetch:', e);
      }
    }

    if (currentToken) {
      headers.set('Authorization', `Bearer ${currentToken}`);
    }

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(path, {
      ...options,
      headers,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isConfigured,
        login,
        loginWithGoogle,
        register,
        logout,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
