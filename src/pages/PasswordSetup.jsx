import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function PasswordSetup() {
  const navigate = useNavigate();
  const { completePasswordSetup, profile } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
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
        <h1 className="text-xl font-black mb-2" style={{ color: '#2B3235' }}>Set Your New Password</h1>
        <p className="text-xs text-gray-500 mb-5">
          Welcome {profile?.displayName || ''}. Please create a permanent password for your account. After this, you can sign in using either your password or Google.
        </p>
        {error && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="form-label">New Password</label>
            <div className="relative">
              <input
                className="form-input pr-10"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPass((v) => !v)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">Confirm Password</label>
            <input
              className="form-input"
              type={showPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="btn-maroon w-full justify-center py-2.5" disabled={loading}>
            {loading ? 'Saving...' : 'Save Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

