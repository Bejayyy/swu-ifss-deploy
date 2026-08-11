import React, { useState, useEffect } from 'react';
import { User, Lock, Bell, Check, ShieldCheck, Mail, Phone, Building2, ChevronRight, KeyRound, Camera, Upload, Trash2 } from 'lucide-react';
import { updatePassword } from 'firebase/auth';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../hooks/useModal';
import { ModalRenderer } from '../components/modals/ModalProvider';
import { auth } from '../firebase/firebase';
import { upsertUserProfile } from '../services/userService';

export default function ProfileSettings() {
  const { profile, updateProfileState } = useAuth();
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
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || profile?.avatarUrl || '');
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
      if (profile.photoURL || profile.avatarUrl) {
        setPhotoURL(profile.photoURL || profile.avatarUrl);
      }
    }
  }, [profile]);

  // Helper function to compress avatar image to ~15KB data URL
  const compressImage = (file, maxWidth = 300, maxHeight = 300, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Handle Photo Upload with compression
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotification({
        type: 'error',
        title: 'Invalid File',
        message: 'Please select an image file (PNG, JPG, JPEG, WEBP).',
      });
      return;
    }

    try {
      const compressedBase64 = await compressImage(file, 300, 300, 0.85);
      setPhotoURL(compressedBase64);
      showNotification({
        type: 'success',
        title: 'Photo Processed',
        message: 'Image processed cleanly. Click "Save Profile Changes" to save to the database.',
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Processing Error',
        message: 'Failed to process image file. Please try another picture.',
      });
    }
  };

  const handleRemovePhoto = () => {
    setPhotoURL('');
  };

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
      const profileData = {
        displayName: profileForm.name,
        name: profileForm.name,
        phone: profileForm.phone,
        department: profileForm.department,
        photoURL: photoURL,
        avatarUrl: photoURL,
      };
      await upsertUserProfile(profile.uid, profileData);
      if (updateProfileState) {
        updateProfileState(profileData);
      }
      showNotification({
        type: 'success',
        title: 'Profile Saved',
        message: 'Your profile details and picture have been updated successfully in the database.',
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
              {photoURL ? (
                <img
                  src={photoURL}
                  alt="Profile Avatar"
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-[#800000] shadow-xs flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[#800000] text-white text-xl font-black flex items-center justify-center shadow-xs flex-shrink-0">
                  {profile?.initials || 'U'}
                </div>
              )}
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
                  Update your display name, profile photo, contact phone, department, and account details.
                </p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-6">
                {/* Profile Photo Uploader Section */}
                <div className="flex flex-col sm:flex-row items-center gap-6 p-5 bg-gradient-to-r from-red-50/60 to-amber-50/30 border border-red-100 rounded-2xl">
                  <div className="relative group flex-shrink-0">
                    {photoURL ? (
                      <img
                        src={photoURL}
                        alt="Profile Avatar"
                        className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-md ring-2 ring-red-200"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-[#800000] text-white text-2xl font-black flex items-center justify-center border-4 border-white shadow-md">
                        {profile?.initials || 'U'}
                      </div>
                    )}
                    <label
                      htmlFor="profile-photo-input"
                      className="absolute -bottom-1 -right-1 p-2 bg-[#800000] hover:bg-[#600000] text-white rounded-xl shadow-md cursor-pointer transition-all hover:scale-105"
                      title="Upload Profile Picture"
                    >
                      <Camera size={14} />
                      <input
                        id="profile-photo-input"
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="space-y-1.5 text-center sm:text-left">
                    <h3 className="font-extrabold text-sm text-gray-900">Profile Picture</h3>
                    <p className="text-xs text-gray-500">
                      Upload a clean, professional photo (PNG, JPG, or WEBP under 3MB).
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                      <label
                        htmlFor="profile-photo-btn"
                        className="px-3.5 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer shadow-2xs flex items-center gap-1.5"
                      >
                        <Upload size={13} className="text-[#800000]" />
                        Upload New Photo
                        <input
                          id="profile-photo-btn"
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                      {photoURL && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={13} />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

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
