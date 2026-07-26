import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  roleDefinitionsToMap,
  seedDefaultRoleDefinitions,
  subscribeRoleDefinitions,
} from '../services/roleDefinitionService';
import { useAuth } from './AuthContext';

const RoleConfigContext = createContext(null);

export function RoleConfigProvider({ children }) {
  const { firebaseUser, profile, loading: authLoading } = useAuth();
  const [roleDefinitionsList, setRoleDefinitionsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seedAttemptedRef = useRef(false);

  // Wait for both auth and profile to be ready
  const isReady = !authLoading && firebaseUser && profile;

  useEffect(() => {
    // Don't fetch role definitions until user profile is loaded
    // Developer doesn't need role definitions (and doesn't have Firestore access)
    if (!isReady || profile?.role === 'developer') {
      setLoading(authLoading);
      return undefined;
    }

    setError('');
    
    const unsub = subscribeRoleDefinitions(
      async (list) => {
        if (!list.length && !seedAttemptedRef.current) {
          seedAttemptedRef.current = true;
          try {
            await seedDefaultRoleDefinitions();
            return;
          } catch (err) {
            console.error('Role definitions seed error:', err);
            setError(err.message || 'Failed to initialize role definitions.');
            setLoading(false);
          }
        }
        setRoleDefinitionsList(list);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('Role definitions subscription error:', err);
        setError(err.message || 'Failed to load role definitions.');
        setLoading(false);
      },
    );
    return unsub;
  }, [isReady, authLoading, firebaseUser, profile]);

  const roleDefinitions = useMemo(
    () => roleDefinitionsToMap(roleDefinitionsList),
    [roleDefinitionsList],
  );

  const value = useMemo(
    () => ({
      roleDefinitions,
      roleDefinitionsList,
      loading,
      error,
    }),
    [roleDefinitions, roleDefinitionsList, loading, error],
  );

  return (
    <RoleConfigContext.Provider value={value}>
      {children}
    </RoleConfigContext.Provider>
  );
}

export function useRoleConfig() {
  const ctx = useContext(RoleConfigContext);
  if (!ctx) {
    return { roleDefinitions: {}, roleDefinitionsList: [], loading: false, error: '' };
  }
  return ctx;
}
