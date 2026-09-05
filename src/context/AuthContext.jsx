import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/firebase';
import {
  DEVELOPER_ROUTE_PREFIX,
  REGISTRAR_HOME,
  ROLES,
  MAIN_APP_ROLES,
  COLLECTIONS,
  USER_STATUS,
} from '../firebase/constants';
import {
  mapAuthError,
  normalizeEmail,
  validateInstitutionalEmail,
  getInitials,
} from '../firebase/authHelpers';
import {
  canAccessDeveloperApp,
  canAccessMainApp,
  fetchUserProfile,
  migrateInvitedUserToUid,
  touchLastLogin,
  upsertUserProfile,
} from '../services/userService';

const AuthContext = createContext(null);

// Read hardcoded developer credentials from env
const DEV_EMAIL = (import.meta.env.VITE_DEV_EMAIL || '').trim().toLowerCase();
const DEV_PASSWORD = import.meta.env.VITE_DEV_PASSWORD || '';

function isDeveloperCredentials(email, password) {
  if (!DEV_EMAIL || !DEV_PASSWORD) return false;
  return email.trim().toLowerCase() === DEV_EMAIL && password === DEV_PASSWORD;
}

function getRedirectForRole(role) {
  if (role === ROLES.DEVELOPER) return DEVELOPER_ROUTE_PREFIX;
  if (MAIN_APP_ROLES.includes(role)) return REGISTRAR_HOME;
  return '/login';
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false);
  const signupInProgressRef = useRef(false);
  const loginInProgressRef = useRef(false);

  const clearSession = useCallback(async () => {
    try { await signOut(auth); } catch { /* ignore */ }
    setProfile(null);
    setFirebaseUser(null);
    setRequiresPasswordSetup(false);
  }, []);

  const loadProfileForUser = useCallback(
    async (user, { updateLogin = false } = {}) => {
      let userProfile = await fetchUserProfile(user.uid);
      if (!userProfile && user.email) {
        userProfile = await migrateInvitedUserToUid(user.uid, user.email);
      }

      if (!userProfile) {
        await clearSession();
        throw new Error(
          'Your account is not provisioned. Contact the Registrar administrator to be added.',
        );
      }

      const allowed = canAccessDeveloperApp(userProfile)
        || (await canAccessMainApp(userProfile));
      if (!allowed) {
        await clearSession();
        if (userProfile.status !== 'active') {
          throw new Error('Your account is inactive. Contact the Registrar administrator.');
        }
        throw new Error('You do not have access to this application.');
      }

      if (updateLogin) {
        try {
          await touchLastLogin(user.uid);
        } catch {
          // Non-fatal: lastLoginAt update requires Firestore rules; don't block sign-in.
        }
      }

      setProfile(userProfile);
      setRequiresPasswordSetup(Boolean(userProfile.mustSetPassword));
      return userProfile;
    },
    [clearSession],
  );

  /**
   * Ensures the developer Firebase Auth account and Firestore profile exist.
   * Creates them on first login so the developer never needs manual setup.
   */
  const ensureDeveloperAccount = useCallback(async (email, password) => {
    let credential;
    try {
      // Try to sign in first
      credential = await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        // Auto-create the Firebase Auth account
        try {
          credential = await createUserWithEmailAndPassword(auth, email, password);
        } catch (createErr) {
          if (createErr.code === 'auth/email-already-in-use') {
            // Account exists but password is different — this shouldn't happen with hardcoded creds
            throw new Error('Developer account exists with a different password. Check your .env credentials.');
          }
          throw createErr;
        }
      } else {
        throw err;
      }
    }

    const { uid } = credential.user;

    // Ensure Firestore developer profile exists
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        email,
        displayName: 'Developer',
        role: ROLES.DEVELOPER,
        status: USER_STATUS.ACTIVE,
        permissions: [],
        department: 'IT',
        phone: '',
        initials: 'DV',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
    }

    return credential;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setAuthError(null);
      try {
        if (!user) {
          setFirebaseUser(null);
          setProfile(null);
          setRequiresPasswordSetup(false);
          return;
        }

        if (signupInProgressRef.current || loginInProgressRef.current) return;

        // Skip institutional email validation for developer account
        const isDev = user.email && user.email.toLowerCase() === DEV_EMAIL;
        if (!isDev) {
          const domainCheck = validateInstitutionalEmail(user.email);
          if (!domainCheck.valid) {
            await clearSession();
            setAuthError(domainCheck.message);
            return;
          }
        }

        setFirebaseUser(user);
        await loadProfileForUser(user);
      } catch (err) {
        setAuthError(err.message || 'Unable to verify account.');
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [clearSession, loadProfileForUser]);

  const login = useCallback(
    async (email, password) => {
      setAuthError(null);

      // Check if these are developer credentials
      if (isDeveloperCredentials(email, password)) {
        loginInProgressRef.current = true;
        try {
          const credential = await ensureDeveloperAccount(DEV_EMAIL, DEV_PASSWORD);
          const userProfile = await loadProfileForUser(credential.user, { updateLogin: true });
          setFirebaseUser(credential.user);
          return { redirectTo: DEVELOPER_ROUTE_PREFIX };
        } catch (err) {
          const message = mapAuthError(err);
          setAuthError(message);
          throw new Error(message);
        } finally {
          loginInProgressRef.current = false;
        }
      }

      // Normal user login — validate institutional email
      const validation = validateInstitutionalEmail(email);
      if (!validation.valid) throw new Error(validation.message);

      loginInProgressRef.current = true;
      try {
        const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
        const userProfile = await loadProfileForUser(credential.user, { updateLogin: true });
        setFirebaseUser(credential.user);
        
        // Check if user must set a password on first login
        if (userProfile.mustSetPassword) {
          return { redirectTo: '/set-password' };
        }
        
        return { redirectTo: getRedirectForRole(userProfile.role) };
      } catch (err) {
        const message = mapAuthError(err);
        setAuthError(message);
        throw new Error(message);
      } finally {
        loginInProgressRef.current = false;
      }
    },
    [loadProfileForUser, ensureDeveloperAccount],
  );

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    loginInProgressRef.current = true;
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const userProfile = await loadProfileForUser(credential.user, { updateLogin: true });
      setFirebaseUser(credential.user);
      return {
        redirectTo: userProfile.mustSetPassword
          ? '/set-password'
          : getRedirectForRole(userProfile.role),
      };
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        throw new Error('Google sign-in was cancelled.');
      }
      const message = mapAuthError(err);
      setAuthError(message);
      throw new Error(message);
    } finally {
      loginInProgressRef.current = false;
    }
  }, [loadProfileForUser]);

  const completePasswordSetup = useCallback(async (newPassword) => {
    if (!auth.currentUser) throw new Error('Please sign in first.');
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const uid = auth.currentUser.uid;
    const userEmail = (auth.currentUser.email || '').trim().toLowerCase();

    // 1. Replace the temporary password in Firebase Auth. Do not mark setup as
    // complete unless either the client or trusted Admin update succeeds.
    let passwordUpdated = false;
    try {
      await updatePassword(auth.currentUser, newPassword);
      passwordUpdated = true;
    } catch (authError) {
      console.warn('Client updatePassword note, calling admin service:', authError);
    }

    // Call Cloud Function to ensure Admin SDK updates all auth accounts & Firestore records for this email
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../firebase/firebase');
      const setUserPasswordAdmin = httpsCallable(functions, 'setUserPasswordAdmin');
      await setUserPasswordAdmin({ newPassword });
      passwordUpdated = true;
    } catch (cloudErr) {
      console.warn('setUserPasswordAdmin cloud call note:', cloudErr);
      if (!passwordUpdated) {
        throw new Error('Your password could not be updated. Your temporary password is still active; please try again.');
      }
    }

    if (!passwordUpdated) throw new Error('Your password could not be updated. Please try again.');

    if (uid) {
      try {
        // Get current auth providers to preserve them
        const currentProfile = await fetchUserProfile(uid);
        const currentProviders = currentProfile?.authProviders || [];
        
        // Add 'password' and 'google' if user signed in with Google
        const hasGoogle = auth.currentUser.providerData?.some(p => p.providerId === 'google.com');
        const updatedProviders = [...new Set([...currentProviders, 'password', ...(hasGoogle ? ['google'] : [])])];
        
        await upsertUserProfile(uid, {
          mustSetPassword: false,
          passwordEnabled: true,
          passwordSetAt: serverTimestamp(),
          authProviders: updatedProviders,
        });

        // Also update any migrated or original invited record matching this email
        if (userEmail) {
          try {
            const { getDocs, query, collection, where, writeBatch } = await import('firebase/firestore');
            const userQ = query(collection(db, COLLECTIONS.USERS), where('email', '==', userEmail));
            const snap = await getDocs(userQ);
            if (!snap.empty) {
              const b = writeBatch(db);
              snap.docs.forEach((d) => {
                b.set(d.ref, { mustSetPassword: false, passwordEnabled: true, passwordSetAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
              });
              await b.commit();
            }
          } catch (e) {
            console.warn('Multi-doc email sync note:', e);
          }
        }

        const refreshed = await fetchUserProfile(uid);
        setProfile(refreshed);
        setRequiresPasswordSetup(false);
      } catch (profileErr) {
        console.warn('Profile update note:', profileErr);
        setRequiresPasswordSetup(false);
      }
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      firebaseUser,
      profile,
      loading,
      authError,
      requiresPasswordSetup,
      isDeveloper: profile?.role === ROLES.DEVELOPER,
      isRegistrar: profile?.role === ROLES.REGISTRAR,
      login,
      loginWithGoogle,
      completePasswordSetup,
      logout,
      setAuthError,
      setProfile,
      updateProfileState: (updates) => setProfile((prev) => (prev ? { ...prev, ...updates } : prev)),
    }),
    [
      firebaseUser,
      profile,
      loading,
      authError,
      requiresPasswordSetup,
      login,
      loginWithGoogle,
      completePasswordSetup,
      logout,
    ],
  );


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
