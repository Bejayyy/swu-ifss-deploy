import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, KeyRound, ShieldCheck, Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import { INSTITUTIONAL_EMAIL_DOMAIN } from '../firebase/constants';
import { validateInstitutionalEmail } from '../firebase/authHelpers';
import AuthLayout from '../components/auth/AuthLayout';

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
            className="flex items-center justify-center rounded-full transition-all duration-300 shadow-2xs"
            style={{
              width: 30,
              height: 30,
              background: step >= s ? '#7A0808' : '#f3f4f6',
              color: step >= s ? '#fff' : '#9ca3af',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {step > s ? '✓' : i + 1}
          </div>
          {i < 2 && (
            <div
              className="transition-all duration-300 rounded-full"
              style={{
                width: 36,
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
    <AuthLayout
      title="Reset Password"
      subtitle="Follow the steps to securely recover your portal access."
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
      <StepIndicator />

      {error && (
        <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-150 rounded-xl px-4 py-3 mb-4 shadow-2xs">
          {error}
        </div>
      )}
      {success && !error && (
        <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-150 rounded-xl px-4 py-3 mb-4 shadow-2xs">
          {success}
        </div>
      )}

      {/* ─── Step 1: Email ────────────────────────────────────────────── */}
      {step === STEPS.EMAIL && (
        <form onSubmit={handleSendOTP} className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-red-50/50 rounded-xl border border-red-100 mb-4">
            <Mail size={16} className="text-[#7A0808] shrink-0" />
            <p className="text-xs text-gray-600 font-medium">
              Enter your institutional email to receive a 6-digit verification code.
            </p>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">Institutional Email</label>
            <input
              className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
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
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-[#7A0808] hover:bg-[#600000] active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Sending Code…</span>
              </>
            ) : (
              'Send Verification Code'
            )}
          </button>
        </form>
      )}

      {/* ─── Step 2: OTP ──────────────────────────────────────────────── */}
      {step === STEPS.OTP && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-red-50/50 rounded-xl border border-red-100 mb-4">
            <KeyRound size={16} className="text-[#7A0808] shrink-0" />
            <p className="text-xs text-gray-600 font-medium">
              Enter the 6-digit code sent to <strong className="text-gray-800">{email}</strong>
            </p>
          </div>

          <div className="flex justify-center gap-2 my-4" onPaste={handleOtpPaste}>
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
                className="w-10 h-12 sm:w-11 sm:h-13 text-center font-black text-xl border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none transition-all bg-white shadow-2xs"
                style={{
                  borderColor: digit ? '#7A0808' : '#e5e7eb',
                }}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {countdown > 0 ? (
            <p className="text-center text-xs text-gray-500 font-medium">
              Code expires in{' '}
              <span className="font-bold" style={{ color: countdown < 60 ? '#dc2626' : '#7A0808' }}>
                {formatTime(countdown)}
              </span>
            </p>
          ) : (
            <p className="text-center text-xs text-red-600 font-semibold">
              Code has expired. Please request a new code.
            </p>
          )}

          <button
            type="button"
            onClick={handleVerifyOTP}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-[#7A0808] hover:bg-[#600000] active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            disabled={loading || countdown === 0}
          >
            Verify Code
          </button>

          <p className="text-center text-xs text-gray-500 pt-1">
            Didn't receive code?{' '}
            {resendCooldown > 0 ? (
              <span className="text-gray-400 font-medium">Resend in {resendCooldown}s</span>
            ) : (
              <button
                type="button"
                onClick={handleResendOTP}
                className="font-bold text-[#7A0808] hover:underline cursor-pointer"
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
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-red-50/50 rounded-xl border border-red-100 mb-3">
            <ShieldCheck size={16} className="text-[#7A0808] shrink-0" />
            <p className="text-xs text-gray-600 font-medium">
              Create a new strong password for your account.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">New Password</label>
            <div className="relative">
              <input
                className="w-full pl-4 pr-11 py-2.5 text-sm border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none font-medium placeholder-gray-300 transition-all bg-white shadow-2xs"
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
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
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
            {confirmPassword && !passwordsMatch && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1 font-semibold">
                <X size={13} /> Passwords do not match
              </p>
            )}
            {passwordsMatch && (
              <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1 font-semibold">
                <Check size={13} /> Passwords match
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-[#7A0808] hover:bg-[#600000] active:scale-[0.99] transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            disabled={loading || !allChecksMet || !passwordsMatch}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Resetting Password…</span>
              </>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
