import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check, X, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';

export default function PasswordSetup() {
  const navigate = useNavigate();
  const { completePasswordSetup, profile, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password requirement checks
  const passwordChecks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'One number (0-9)', met: /[0-9]/.test(password) },
    { label: 'One special character (!@#$%^&*)', met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password) },
  ];
  const allChecksMet = passwordChecks.every((c) => c.met);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!allChecksMet) {
      setError('Please meet all password requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await completePasswordSetup(password);
      navigate(profile?.role === 'developer' ? '/developer' : '/dashboard', { replace: true });
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('requires-recent-login') || msg.includes('re-authentication')) {
        setError('Your sign-in session requires verification. Please click "Sign out and return to login" below, then log in once with your temporary password.');
      } else {
        setError(msg || 'Unable to set password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      navigate('/login');
    }
  };

  return (
    <AuthLayout
      title="Set Your Password"
      subtitle={`Welcome ${profile?.displayName || ''}! Please create a permanent password for your portal account.`}
      footer={(
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer"
        >
          <LogOut size={13} />
          Sign out and return to login
        </button>
      )}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-150 rounded-xl px-4 py-3 shadow-2xs">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 p-3 bg-red-50/50 rounded-xl border border-red-100 mb-2">
          <ShieldCheck size={16} className="text-[#7A0808] shrink-0" />
          <p className="text-xs text-gray-600 font-medium">
            After setting your password, you can sign in using either your credentials or Google.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">New Password</label>
          <div className="relative">
            <input
              className="w-full pl-4 pr-11 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
              type={showPass ? 'text' : 'password'}
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              autoFocus
            />
            <button
              type="button"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
              onClick={() => setShowPass((v) => !v)}
            >
              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {/* Password Requirements Checklist */}
        <div className="rounded-xl px-4 py-3 bg-gray-50 border border-gray-200">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Password Requirements</p>
          <ul className="space-y-1">
            {passwordChecks.map((check, i) => (
              <li key={i} className="flex items-center gap-2">
                {check.met ? (
                  <Check size={13} className="shrink-0 text-emerald-600 font-bold" />
                ) : (
                  <X size={13} className="shrink-0 text-gray-400" />
                )}
                <span className={`text-xs ${check.met ? 'text-emerald-700 font-semibold' : 'text-gray-500'}`}>
                  {check.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Confirm Password</label>
          <input
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
            type={showPass ? 'text' : 'password'}
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <div className="min-h-[22px] mt-1.5 flex items-center">
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500 flex items-center gap-1 font-semibold">
                <X size={13} /> Passwords do not match
              </p>
            )}
            {confirmPassword && passwordsMatch && (
              <p className="text-xs text-emerald-600 flex items-center gap-1 font-semibold">
                <Check size={13} /> Passwords match
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-[#7A0808] hover:bg-[#600000] active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-4"
          disabled={loading || !allChecksMet || !passwordsMatch}
        >
          {loading ? 'Saving Password…' : 'Save Password & Continue'}
        </button>
      </form>
    </AuthLayout>
  );
}
