import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { INSTITUTIONAL_EMAIL_DOMAIN, isDevSignupEnabled } from '../firebase/constants';
import { validateInstitutionalEmail } from '../firebase/authHelpers';
import AuthLayout from '../components/auth/AuthLayout';

export default function DeveloperSignup() {
  const navigate = useNavigate();
  const { signupDeveloper } = useAuth();
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: 'IT',
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isDevSignupEnabled()) {
    return <Navigate to="/login" replace />;
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validation = validateInstitutionalEmail(form.email);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { redirectTo } = await signupDeveloper({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        department: form.department,
      });
      navigate(redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Developer Sign-Up"
      subtitle="Create an institutional developer profile for testing and system administration."
      footer={
        <div className="pt-2">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7A0808] hover:underline"
          >
            <ArrowLeft size={14} />
            <span>Back to Sign In</span>
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-150 rounded-xl px-4 py-3 shadow-2xs">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Full Name</label>
          <input
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7A0808]/30 font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
            placeholder="Juan Dela Cruz"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Institutional Email</label>
          <input
            type="email"
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7A0808]/30 font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
            placeholder={`you@${INSTITUTIONAL_EMAIL_DOMAIN}`}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Department</label>
          <input
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7A0808]/30 font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
            value={form.department}
            onChange={(e) => set('department', e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Password</label>
          <div className="relative">
            <input
              className="w-full pl-4 pr-11 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7A0808]/30 font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••••••"
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Confirm Password</label>
          <input
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7A0808]/30 font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
            type="password"
            placeholder="••••••••••••"
            value={form.confirmPassword}
            onChange={(e) => set('confirmPassword', e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-[#7A0808] hover:bg-[#600000] active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-4"
          disabled={loading}
        >
          {loading ? 'Creating Account…' : 'Create Developer Account'}
        </button>
      </form>
    </AuthLayout>
  );
}
