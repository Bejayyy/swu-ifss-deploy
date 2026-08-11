import React, { useState, useEffect } from 'react';
import { User, Lock, Bell, Check, ShieldCheck, Mail, Phone, Building2, ChevronRight, KeyRound } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../hooks/useModal';
import { ModalRenderer } from '../components/modals/ModalProvider';
import { auth } from '../firebase/firebase';
import { upsertUserProfile } from '../services/userService';

export default function ProfileSettings() {
  const { profile } = useAuth();
  const { showNotification, confirmState, notificationState } = useModal();

  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'security' | 'preferences'

  // Profile Form state
  const [profileForm, setProfileForm] = useState({
    name: profile?.displayName || profile?.name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
    department: profile?.department || profile?.college || '',
    role: profile?.role || 'User',
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        name: profile.displayName || profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        department: profile.department || profile.college || '',
        role: profile.role || 'User',
      });
    }
  }, [profile]);

  // Security Form state
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Preference Toggles state
  const [preferences, setPreferences] = useState({
    emailAlerts: true,
    inAppNotifs: true,
    approvalUpdates: true,
  });

  // Handle Profile Update
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profile?.uid) return;
    setIsUpdatingProfile(true);
    try {
      await upsertUserProfile(profile.uid, {
        displayName: profileForm.name,
        name: profileForm.name,
        phone: profileForm.phone,
        department: profileForm.department,
      });
      showNotification({
        type: 'success',
        title: 'Profile Saved',
        message: 'Your profile details have been updated successfully in the database.',
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Failed to update profile details.',
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Handle Password Change
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showNotification({
        type: 'error',
        title: 'Password Mismatch',
        message: 'New password and confirmation password do not match.',
      });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      showNotification({
        type: 'warning',
        title: 'Weak Password',
        message: 'Password must be at least 6 characters long.',
      });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, passwordForm.newPassword);
        showNotification({
          type: 'success',
          title: 'Password Updated',
          message: 'Your account password has been updated successfully.',
        });
        setPasswordForm({ newPassword: '', confirmPassword: '' });
      }
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Password Update Failed',
        message: err.message || 'Requires recent sign in. Please log out and log back in to update password.',
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <Layout title="Profile & Account Settings" subtitle="Manage your user profile details, credentials, and notification preferences">
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-start">
        {/* Left Column: Profile Summary & Navigation Menu */}
        <div className="space-y-4 sticky top-20">
          {/* Top Profile Card Summary */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-[#800000] text-white text-xl font-black flex items-center justify-center shadow-xs flex-shrink-0">
                {profile?.initials || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-extrabold text-sm text-gray-900 truncate">{profileForm.name || 'User'}</h3>
                <p className="text-[11px] text-gray-500 truncate">{profileForm.email}</p>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-50 text-[#800000] border border-red-100">
                  {profileForm.role}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Menu (Matching Reference Layout) */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-3 shadow-2xs space-y-1">
            <p className="px-3 pt-2 pb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">
              Account & Settings
            </p>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'profile'
                  ? 'bg-[#800000] text-white shadow-2xs'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <User size={16} />
                <span>Profile Information</span>
              </div>
              <ChevronRight size={14} className={activeTab === 'profile' ? 'opacity-100' : 'opacity-40'} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'security'
                  ? 'bg-[#800000] text-white shadow-2xs'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Lock size={16} />
                <span>Account Security</span>
              </div>
              <ChevronRight size={14} className={activeTab === 'security' ? 'opacity-100' : 'opacity-40'} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preferences')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'preferences'
                  ? 'bg-[#800000] text-white shadow-2xs'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Bell size={16} />
                <span>Notification Preferences</span>
              </div>
              <ChevronRight size={14} className={activeTab === 'preferences' ? 'opacity-100' : 'opacity-40'} />
            </button>
          </div>
        </div>

        {/* Right Main Content Container */}
        <div className="space-y-6">
          {/* TAB 1: PROFILE INFORMATION */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-2xs space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-xl font-black text-[#2B3235] flex items-center gap-2.5">
                  <User size={22} className="text-[#800000]" /> Profile Information
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Update your display name, contact phone, department, and account information.
                </p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label text-xs font-bold text-gray-700 mb-1 block">Full Name</label>
                    <input
                      type="text"
                      className="form-input text-xs font-semibold w-full"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label text-xs font-bold text-gray-700 mb-1 block">Email Address (Read-only)</label>
                    <input
                      type="email"
                      className="form-input text-xs font-semibold w-full bg-gray-100 cursor-not-allowed"
                      value={profileForm.email}
                      disabled
                    />
                  </div>

                  <div>
                    <label className="form-label text-xs font-bold text-gray-700 mb-1 block">Phone / Contact Number</label>
                    <input
                      type="text"
                      className="form-input text-xs font-semibold w-full"
                      placeholder="e.g. +63 912 345 6789"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label text-xs font-bold text-gray-700 mb-1 block">Department / College</label>
                    <input
                      type="text"
                      className="form-input text-xs font-semibold w-full"
                      placeholder="e.g. College of Information Technology"
                      value={profileForm.department}
                      onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <button
                    type="submit"
                    disabled={isUpdatingProfile}
                    className="btn-maroon px-6 py-2.5 text-xs font-bold rounded-xl shadow-xs"
                  >
                    {isUpdatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: ACCOUNT SECURITY */}
          {activeTab === 'security' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-2xs space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-xl font-black text-[#2B3235] flex items-center gap-2.5">
                  <Lock size={22} className="text-[#800000]" /> Account Security & Password
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Change your password and manage account security preferences.
                </p>
              </div>

              <form onSubmit={handleUpdatePassword} className="space-y-5 max-w-md">
                <div>
                  <label className="form-label text-xs font-bold text-gray-700 mb-1 block">New Password</label>
                  <input
                    type="password"
                    className="form-input text-xs font-semibold w-full"
                    placeholder="Enter new password (min. 6 chars)"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="form-label text-xs font-bold text-gray-700 mb-1 block">Confirm New Password</label>
                  <input
                    type="password"
                    className="form-input text-xs font-semibold w-full"
                    placeholder="Re-enter new password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="btn-maroon px-6 py-2.5 text-xs font-bold rounded-xl shadow-xs"
                  >
                    {isUpdatingPassword ? 'Updating Password...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: NOTIFICATION PREFERENCES */}
          {activeTab === 'preferences' && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-2xs space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-xl font-black text-[#2B3235] flex items-center gap-2.5">
                  <Bell size={22} className="text-[#800000]" /> Notification Preferences
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Choose how and when you receive system alerts and reservation updates.
                </p>
              </div>

              <div className="space-y-4 max-w-lg">
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Email Notifications</p>
                    <p className="text-[11px] text-slate-500">Receive email alerts for new reservation updates</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.emailAlerts}
                    onChange={(e) => setPreferences({ ...preferences, emailAlerts: e.target.checked })}
                    className="w-4 h-4 accent-[#800000] cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div>
                    <p className="text-xs font-bold text-slate-800">In-App Notifications</p>
                    <p className="text-[11px] text-slate-500">Show bell badge alerts in system top navigation</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.inAppNotifs}
                    onChange={(e) => setPreferences({ ...preferences, inAppNotifs: e.target.checked })}
                    className="w-4 h-4 accent-[#800000] cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Approval Workflow Updates</p>
                    <p className="text-[11px] text-slate-500">Notify when requests require your role signature</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={preferences.approvalUpdates}
                    onChange={(e) => setPreferences({ ...preferences, approvalUpdates: e.target.checked })}
                    className="w-4 h-4 accent-[#800000] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
