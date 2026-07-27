import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import systemLogo from '../assets/logo.png';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: '#7A0808' }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1562774053-701939374585?w=1400&q=80')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.22,
          filter: 'blur(2px)',
        }}
      />

      <div
        className="relative bg-white rounded-3xl shadow-2xl w-full px-10 py-10"
        style={{ maxWidth: 420 }}
      >
        <div className="flex flex-col items-center mb-7">
          {systemLogo ? (
            <img src={systemLogo} alt="SWU-IFSS logo" className="h-20 w-auto object-contain mb-3" />
          ) : null}
          <p className="text-xs text-gray-400">Southwestern University PHINMA</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}
          <div className="mb-4">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="mb-6">
            <label className="form-label">Password</label>
            <div className="relative">
              <input
                className="form-input pr-10"
                type={showPass ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="flex justify-end mt-1.5">
              <Link
                to="/forgot-password"
                className="text-xs font-semibold hover:underline"
                style={{ color: '#7A0808' }}
              >
                Forgot Password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl font-black text-sm text-white transition-all"
            style={{ background: '#7A0808' }}
            disabled={loading}
          >
            {loading ? 'Signing In…' : 'Sign In'}
          </button>
        </form>
        <div className="mt-3">
          <button
            type="button"
            className="w-full py-3 rounded-xl font-black text-sm border border-gray-200 text-[#2B3235] bg-white"
            disabled={loading}
            onClick={handleGoogleLogin}
          >
            Continue with Google
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} Southwestern University PHINMA. All rights reserved.
        </p>
      </div>
    </div>
  );
}
