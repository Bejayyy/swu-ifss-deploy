import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useRoleConfig } from '../../context/RoleConfigContext';
import { canAccessRouteForProfile } from '../../constants/rolePermissions';
import { DEVELOPER_ROUTE_PREFIX, MAIN_APP_ROLES, REGISTRAR_HOME, ROLES } from '../../firebase/constants';

function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f4f5f7' }}>
      <div className="text-center">
        <div
          className="w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-3"
          style={{ borderColor: '#7A080833', borderTopColor: '#7A0808' }}
        />
        <p className="text-sm font-semibold" style={{ color: '#2B3235' }}>Verifying session…</p>
      </div>
    </div>
  );
}

export function DeveloperRoute({ children }) {
  const { loading, profile, firebaseUser } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!firebaseUser || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (profile.role !== ROLES.DEVELOPER || profile.status !== 'active') {
    if (profile.role === ROLES.REGISTRAR) {
      return <Navigate to={REGISTRAR_HOME} replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function RegistrarRoute({ children }) {
  const { loading, profile, firebaseUser } = useAuth();
  const { roleDefinitions, loading: rolesLoading } = useRoleConfig();
  const location = useLocation();

  if (loading || rolesLoading) return <AuthLoading />;
  if (!firebaseUser || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (profile.role === ROLES.DEVELOPER) {
    return <Navigate to={DEVELOPER_ROUTE_PREFIX} replace />;
  }
  const hasAppRole = MAIN_APP_ROLES.includes(profile.role) || Boolean(roleDefinitions[profile.role]);
  if (!hasAppRole || profile.status !== 'active') {
    return <Navigate to="/login" replace />;
  }
  if (!canAccessRouteForProfile(profile, location.pathname, roleDefinitions)) {
    return <Navigate to={REGISTRAR_HOME} replace />;
  }
  return children;
}

export function PasswordSetupRoute({ children }) {
  const { loading, profile, firebaseUser, requiresPasswordSetup } = useAuth();
  if (loading) return <AuthLoading />;
  if (!firebaseUser || !profile) return <Navigate to="/login" replace />;
  if (!requiresPasswordSetup) return <Navigate to={REGISTRAR_HOME} replace />;
  return children;
}

export function PublicOnlyRoute({ children }) {
  const { loading, profile, firebaseUser } = useAuth();

  if (loading) return <AuthLoading />;
  if (firebaseUser && profile?.role === ROLES.DEVELOPER) {
    return <Navigate to={DEVELOPER_ROUTE_PREFIX} replace />;
  }
  if (firebaseUser && MAIN_APP_ROLES.includes(profile?.role)) {
    return <Navigate to={REGISTRAR_HOME} replace />;
  }
  return children;
}
