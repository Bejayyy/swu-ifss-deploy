import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function PasswordSetup() {
  const navigate = useNavigate();
  const { completePasswordSetup, profile } = useAuth();
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
      // Redirect to dashboard after successful password setup
      navigate(profile?.role === 'developer' ? '/developer' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to set password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#7A0808' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <h1 className="text-xl font-black mb-2" style={{ color: '#2B3235' }}>Set your Password</h1>
        <p className="text-xs text-gray-500 mb-5">
          Welcome <strong className="font-bold uppercase" style={{ color: '#2B3235' }}>{profile?.displayName || ''}</strong>. Please create a permanent password for your account. After this, you can sign in using either your password or Google.
        </p>
        {error && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="form-label">New Password</label>
            <div className="relative">
              <input
                className="form-input pr-10"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPass((v) => !v)}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Password Requirements Checklist */}
          <div
            className="rounded-lg px-3 py-2.5"
            style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}
          >
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Password Requirements</p>
            <ul className="space-y-1">
              {passwordChecks.map((check, i) => (
                <li key={i} className="flex items-center gap-2">
                  {check.met ? (
                    <Check size={14} className="shrink-0" style={{ color: '#16a34a' }} />
                  ) : (
                    <X size={14} className="shrink-0" style={{ color: password ? '#dc2626' : '#9ca3af' }} />
                  )}
                  <span
                    className="text-xs transition-colors"
                    style={{ color: check.met ? '#16a34a' : password ? '#6b7280' : '#9ca3af' }}
                  >
                    {check.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="form-label">Confirm Password</label>
            <input
              className="form-input"
              type={showPass ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <X size={12} /> Passwords do not match
              </p>
            )}
            {passwordsMatch && (
              <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#16a34a' }}>
                <Check size={12} /> Passwords match
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn-maroon w-full justify-center py-2.5 text-sm font-semibold transition-all disabled:opacity-60"
            disabled={loading || !allChecksMet || !passwordsMatch}
          >
            {loading ? 'Saving...' : 'Save Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
