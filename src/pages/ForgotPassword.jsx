import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, KeyRound, ShieldCheck, Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import { INSTITUTIONAL_EMAIL_DOMAIN } from '../firebase/constants';
import { validateInstitutionalEmail } from '../firebase/authHelpers';
import systemLogo from '../assets/logo.png';

const STEPS = { EMAIL: 1, OTP: 2, NEW_PASSWORD: 3 };
const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.EMAIL);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Step 1: Send OTP ──────────────────────────────────────────────────────
  const handleSendOTP = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    const validation = validateInstitutionalEmail(email);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setLoading(true);
    try {
      const sendOTP = httpsCallable(functions, 'sendPasswordResetOTP');
      await sendOTP({ email: email.trim().toLowerCase() });
      setStep(STEPS.OTP);
      setCountdown(OTP_EXPIRY_SECONDS);
      setResendCooldown(60);
      setSuccess('A verification code has been sent to your email.');
    } catch (err) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: OTP Input Handling ────────────────────────────────────────────
  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
  };

  const handleVerifyOTP = () => {
    const otpString = otp.join('');
    if (otpString.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }
    setError('');
    setStep(STEPS.NEW_PASSWORD);
  };

  // ─── Step 3: Reset Password ────────────────────────────────────────────────
  // Password requirement checks
  const passwordChecks = [
    { label: 'At least 8 characters', met: newPassword.length >= 8 },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(newPassword) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(newPassword) },
    { label: 'One number (0-9)', met: /[0-9]/.test(newPassword) },
    { label: 'One special character (!@#$%^&*)', met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword) },
  ];
  const allChecksMet = passwordChecks.every((c) => c.met);
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;

  const handleResetPassword = async (e) => {
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
      const resetPassword = httpsCallable(functions, 'verifyOTPAndResetPassword');
      await resetPassword({
        email: email.trim().toLowerCase(),
        otp: otp.join(''),
        newPassword,
      });
      setSuccess('Password reset successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      const msg = err.message || 'Failed to reset password.';
      // If OTP expired or too many attempts, go back to email step
      if (msg.includes('expired') || msg.includes('request a new code') || msg.includes('Too many')) {
        setError(msg);
        setStep(STEPS.EMAIL);
        setOtp(['', '', '', '', '', '']);
        setCountdown(0);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend OTP ────────────────────────────────────────────────────────────
  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    setOtp(['', '', '', '', '', '']);
    await handleSendOTP();
  };

  // ─── Step Indicator ────────────────────────────────────────────────────────
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[STEPS.EMAIL, STEPS.OTP, STEPS.NEW_PASSWORD].map((s, i) => (
        <React.Fragment key={s}>
          <div
            className="flex items-center justify-center rounded-full transition-all duration-300"
            style={{
              width: 32,
              height: 32,
              background: step >= s ? '#7A0808' : '#e5e7eb',
              color: step >= s ? '#fff' : '#9ca3af',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {step > s ? '✓' : i + 1}
          </div>
          {i < 2 && (
            <div
              className="transition-all duration-300"
              style={{
                width: 40,
                height: 2,
                background: step > s ? '#7A0808' : '#e5e7eb',
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

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
        {/* Logo */}
        <div className="flex flex-col items-center mb-5">
          <img src={systemLogo} alt="SWU-IFSS logo" className="h-16 w-auto object-contain mb-2" />
          <h2 className="text-lg font-black" style={{ color: '#2B3235' }}>
            Reset Password
          </h2>
        </div>

        <StepIndicator />

        {/* Error / Success Messages */}
        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}
        {success && !error && (
          <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-4">
            {success}
          </p>
        )}

        {/* ─── Step 1: Email ────────────────────────────────────────────── */}
        {step === STEPS.EMAIL && (
          <form onSubmit={handleSendOTP}>
            <div className="flex items-center gap-2 mb-4">
              <Mail size={18} className="text-gray-400" />
              <p className="text-xs text-gray-500">
                Enter your institutional email and we'll send you a verification code.
              </p>
            </div>
            <div className="mb-5">
              <label className="form-label">Institutional email</label>
              <input
                className="form-input"
                type="email"
                placeholder={`you@${INSTITUTIONAL_EMAIL_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl font-black text-sm text-white transition-all flex items-center justify-center gap-2"
              style={{ background: '#7A0808' }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sending Code…
                </>
              ) : (
                'Send Verification Code'
              )}
            </button>
          </form>
        )}

        {/* ─── Step 2: OTP ──────────────────────────────────────────────── */}
        {step === STEPS.OTP && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <KeyRound size={18} className="text-gray-400" />
              <p className="text-xs text-gray-500">
                Enter the 6-digit code sent to <strong>{email}</strong>
              </p>
            </div>

            {/* OTP Input Boxes */}
            <div className="flex justify-center gap-2 mb-4" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="form-input text-center font-bold"
                  style={{
                    width: 48,
                    height: 52,
                    fontSize: 22,
                    letterSpacing: 0,
                    borderColor: digit ? '#7A0808' : '#e2e5e8',
                  }}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            {/* Timer */}
            {countdown > 0 ? (
              <p className="text-center text-xs text-gray-500 mb-4">
                Code expires in{' '}
                <span className="font-bold" style={{ color: countdown < 60 ? '#dc2626' : '#7A0808' }}>
                  {formatTime(countdown)}
                </span>
              </p>
            ) : (
              <p className="text-center text-xs text-red-600 font-semibold mb-4">
                Code has expired. Please request a new one.
              </p>
            )}

            <button
              type="button"
              onClick={handleVerifyOTP}
              className="w-full py-3 rounded-xl font-black text-sm text-white transition-all flex items-center justify-center gap-2"
              style={{ background: '#7A0808' }}
              disabled={loading || countdown === 0}
            >
              Verify Code
            </button>

            {/* Resend */}
            <p className="text-center text-xs text-gray-500 mt-3">
              Didn't receive the code?{' '}
              {resendCooldown > 0 ? (
                <span className="text-gray-400">Resend in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOTP}
                  className="font-semibold underline"
                  style={{ color: '#7A0808' }}
                  disabled={loading}
                >
                  Resend Code
                </button>
              )}
            </p>
          </div>
        )}

        {/* ─── Step 3: New Password ─────────────────────────────────────── */}
        {step === STEPS.NEW_PASSWORD && (
          <form onSubmit={handleResetPassword}>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={18} className="text-gray-400" />
              <p className="text-xs text-gray-500">
                Create a new password for your account.
              </p>
            </div>

            <div className="mb-2">
              <label className="form-label">New Password</label>
              <div className="relative">
                <input
                  className="form-input pr-10"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Password Requirements Checklist */}
            <div
              className="rounded-lg px-3 py-2.5 mb-4"
              style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}
            >
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Password Requirements</p>
              <ul className="space-y-1">
                {passwordChecks.map((check, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {check.met ? (
                      <Check size={14} className="shrink-0" style={{ color: '#16a34a' }} />
                    ) : (
                      <X size={14} className="shrink-0" style={{ color: newPassword ? '#dc2626' : '#9ca3af' }} />
                    )}
                    <span
                      className="text-xs transition-colors"
                      style={{ color: check.met ? '#16a34a' : newPassword ? '#6b7280' : '#9ca3af' }}
                    >
                      {check.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mb-5">
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
              className="w-full py-3 rounded-xl font-black text-sm text-white transition-all flex items-center justify-center gap-2"
              style={{ background: allChecksMet && passwordsMatch ? '#7A0808' : '#c4a0a0' }}
              disabled={loading || !allChecksMet || !passwordsMatch}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Resetting Password…
                </>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>
        )}

        {/* Back to Login */}
        <div className="mt-5 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: '#7A0808' }}
          >
            <ArrowLeft size={14} />
            Back to Sign In
          </Link>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          © {new Date().getFullYear()} Southwestern University PHINMA. All rights reserved.
        </p>
      </div>
    </div>
  );
}
