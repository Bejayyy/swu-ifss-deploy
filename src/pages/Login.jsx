import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';

export default function Login() {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    setLoading(true);
    try {
      const { redirectTo } = await login(email, password);
      navigate(redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const { redirectTo } = await loginWithGoogle();
      navigate(redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome Back"
      subtitle="Please enter your credentials to access the portal."
    >
      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-150 rounded-xl px-4 py-3 shadow-2xs">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Username</label>
          <input
            className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
            type="email"
            placeholder="Enter your username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1.5">Password</label>
          <div className="relative">
            <input
              className="w-full pl-4 pr-11 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
              type={showPass ? 'text' : 'password'}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
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

        {/* Options Row */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="accent-[#7A0808] w-4 h-4 rounded cursor-pointer"
            />
            <span>Remember me</span>
          </label>
          <Link
            to="/forgot-password"
            className="text-xs font-bold text-[#7A0808] hover:underline"
          >
            Forgot Password?
          </Link>
        </div>

        {/* Main Sign In Button */}
        <button
          type="submit"
          className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-[#7A0808] hover:bg-[#5E0606] active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-2"
          disabled={loading}
        >
          {loading ? 'Signing In…' : 'Sign In'}
        </button>

        {/* Continue with Google */}
        <button
          type="button"
          className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition-all flex items-center justify-center gap-2.5 mt-3 cursor-pointer shadow-2xs disabled:opacity-60"
          disabled={loading}
          onClick={handleGoogleLogin}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Continue with Google</span>
        </button>
      </form>
    </AuthLayout>
  );
}
