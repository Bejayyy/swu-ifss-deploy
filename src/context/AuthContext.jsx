import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/firebase';
import {
  DEVELOPER_ROUTE_PREFIX,
  REGISTRAR_HOME,
  ROLES,
  MAIN_APP_ROLES,
} from '../firebase/constants';
import {
  mapAuthError,
  normalizeEmail,
  validateInstitutionalEmail,
} from '../firebase/authHelpers';
import {
  canAccessDeveloperApp,
  canAccessMainApp,
  fetchUserProfile,
  migrateInvitedUserToUid,
  touchLastLogin,
  upsertUserProfile,
} from '../services/userService';
import { registerDeveloperAccount } from '../services/developerSignupService';

const AuthContext = createContext(null);

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
    await signOut(auth);
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

        const domainCheck = validateInstitutionalEmail(user.email);
        if (!domainCheck.valid) {
          await clearSession();
          setAuthError(domainCheck.message);
          return;
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
    [loadProfileForUser],
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

    await updatePassword(auth.currentUser, newPassword);
    if (auth.currentUser.uid) {
      // Get current auth providers to preserve them
      const currentProfile = await fetchUserProfile(auth.currentUser.uid);
      const currentProviders = currentProfile?.authProviders || [];
      
      // Add 'password' and 'google' if user signed in with Google
      const hasGoogle = auth.currentUser.providerData?.some(p => p.providerId === 'google.com');
      const updatedProviders = [...new Set([...currentProviders, 'password', ...(hasGoogle ? ['google'] : [])])];
      
      await upsertUserProfile(auth.currentUser.uid, {
        mustSetPassword: false,
        passwordEnabled: true,
        authProviders: updatedProviders,
      });
      const refreshed = await fetchUserProfile(auth.currentUser.uid);
      setProfile(refreshed);
      setRequiresPasswordSetup(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    await clearSession();
  }, [clearSession]);

  const signupDeveloper = useCallback(
    async ({ email, password, displayName, department }) => {
      setAuthError(null);
      signupInProgressRef.current = true;
      try {
        const userProfile = await registerDeveloperAccount({
          email,
          password,
          displayName,
          department,
        });
        setProfile({ uid: userProfile.uid, ...userProfile });
        setFirebaseUser(auth.currentUser);
        await touchLastLogin(userProfile.uid);
        return { redirectTo: DEVELOPER_ROUTE_PREFIX };
      } catch (err) {
        const message = mapAuthError(err);
        setAuthError(message);
        throw new Error(message);
      } finally {
        signupInProgressRef.current = false;
        setLoading(false);
      }
    },
    [],
  );

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
      signupDeveloper,
      setAuthError,
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
      signupDeveloper,
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
