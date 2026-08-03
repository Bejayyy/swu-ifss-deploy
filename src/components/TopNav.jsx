import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, ChevronDown, User, Settings, LockKeyhole, Mail, Phone, BadgeCheck, FileText, Clock3, Menu, AlertTriangle,
} from 'lucide-react';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../constants/layout';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { getInitials } from '../firebase/authHelpers';
import { getActivePendingRecord, isReservationActionable } from '../constants/approvalWorkflow';
import { subscribeMaintenanceReports } from '../services/maintenanceService';
import { getRoleLabel } from '../constants/rolePermissions';

export default function TopNav({ title, subtitle, isDesktop = true, onToggleNav = () => {} }) {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { requests } = useApp();
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [maintenanceReports, setMaintenanceReports] = useState([]);

  const displayName = profile?.displayName || 'User';
  const initials = profile?.initials || getInitials(profile?.displayName, profile?.email) || 'U';
  const roleLabel = getRoleLabel(profile?.role) || 'User';

  const [profileForm, setProfileForm] = useState({
    fullName: displayName,
    role: roleLabel,
    email: profile?.email || '',
    phone: profile?.phone || '',
  });

  const isGsd = profile?.role === 'gsd';

  // Subscribe to maintenance reports for GSD
  useEffect(() => {
    if (!isGsd) return;

    // Subscribe to ALL reports, not just pending - we'll filter for notifications
    const unsubscribe = subscribeMaintenanceReports(
      (reports) => {
        // Show pending and newly reported (not yet acknowledged)
        const unacknowledgedReports = reports.filter(r => 
          r.status === 'pending' || r.status === 'acknowledged'
        );
        setMaintenanceReports(unacknowledgedReports);
      },
      (error) => console.error('Error loading maintenance reports:', error)
      // Remove filter to get all reports, we filter in the callback
    );

    return () => unsubscribe();
  }, [isGsd]);

  // Helper function to format Firestore timestamp
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    let date;
    if (timestamp?.toDate) {
      date = timestamp.toDate();
    } else if (timestamp?.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'N/A';
    }
    
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return `Today, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Helper function to get relative time
  const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Recently';
    
    let date;
    if (timestamp?.toDate) {
      date = timestamp.toDate();
    } else if (timestamp?.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'Recently';
    }

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return 'More than a week ago';
  };

  // Generate notifications from pending approval requests and maintenance reports
  const notifItems = useMemo(() => {
    const approvalNotifications = [];
    const maintenanceNotifications = [];

    // Approval notifications
    if (requests && profile?.role && profile) {
      requests.forEach((req) => {
        if (!isReservationActionable(req, profile.role, profile)) return;

        const timeAgo = getTimeAgo(req.createdAt);
        const requestType = req.type === 'academic' ? 'Academic' : 'Non-Academic';

        approvalNotifications.push({
          id: req.id,
          type: 'Pending',
          notificationType: 'approval',
          title: `${requestType} reservation needs approval`,
          requester: req.requestedBy || req.requestor || 'Unknown',
          request: req.activity || req.title || 'Room Reservation',
          location: req.designatedVenue || req.building || 'N/A',
          submittedAt: formatDate(req.createdAt),
          time: timeAgo,
          unread: true,
          reservationId: req.id,
          reservationType: req.type,
        });
      });
    }

    // Maintenance notifications (for GSD only)
    if (isGsd && maintenanceReports.length > 0) {
      maintenanceReports.forEach((report) => {
        const timeAgo = getTimeAgo(report.createdAt);
        const priorityLabel = report.priority === 'urgent' ? 'URGENT' :
                            report.priority === 'high' ? 'High Priority' :
                            report.priority === 'medium' ? 'Medium Priority' : 'Low Priority';

        maintenanceNotifications.push({
          id: report.id,
          type: report.priority === 'urgent' || report.priority === 'high' ? 'Urgent' : 'Info',
          notificationType: 'maintenance',
          title: `${priorityLabel} maintenance report`,
          requester: report.reportedByName || 'Unknown',
          request: report.issue,
          location: `${report.roomName} - ${report.buildingName}`,
          submittedAt: formatDate(report.createdAt),
          time: timeAgo,
          unread: true,
          reportId: report.id,
          priority: report.priority,
        });
      });
    }

    // Combine and sort by most recent first
    return [...maintenanceNotifications, ...approvalNotifications].sort((a, b) => {
      const aTime = a.submittedAt === 'N/A' ? 0 : new Date(a.submittedAt).getTime();
      const bTime = b.submittedAt === 'N/A' ? 0 : new Date(b.submittedAt).getTime();
      return bTime - aTime;
    });
  }, [requests, profile, maintenanceReports, isGsd]);

  const handleSignOut = async () => {
    closeAll();
    await logout();
    navigate('/login');
  };

  const handleViewRequest = (notification) => {
    setShowNotif(false);
    
    if (notification.notificationType === 'maintenance') {
      // Navigate to maintenance dashboard
      navigate('/maintenance-dashboard');
    } else {
      // Navigate to the request details page based on type
      const isAcademic = notification.reservationType === 'academic';
      const path = isAcademic 
        ? `/academic-request/${notification.reservationId}` 
        : `/request/${notification.reservationId}`;
      
      navigate(path);
    }
  };

  const unreadCount = notifItems.length; // All pending approvals are considered unread
  const r = 10;
  const closeAll = () => {
    setShowNotif(false);
    setShowProfile(false);
    setShowProfileModal(false);
    setShowEditProfileModal(false);
    setShowSettingsModal(false);
    setShowForgotPassword(false);
  };
  const hasAnyOverlay =
    showNotif || showProfile || showProfileModal || showEditProfileModal || showSettingsModal || showForgotPassword;

  return (
    <div
      className="fixed top-0 right-0 z-40 flex items-center justify-between px-3 sm:px-4 lg:px-6 print:hidden"
      style={{
        left: isDesktop ? NAV_WIDTH_PX : 0,
        height: TOP_NAV_HEIGHT_PX,
        background: '#800000',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      <div className="min-w-0 flex items-center gap-2 sm:gap-3">
        {!isDesktop && (
          <button
            type="button"
            onClick={onToggleNav}
            className="relative p-2 hover:bg-white/10 transition-colors flex-shrink-0"
            style={{ borderRadius: r }}
            aria-label="Open sidebar"
          >
            <Menu size={20} className="text-white" />
          </button>
        )}
        <div className="min-w-0">
        <h1 className="text-white font-bold text-lg sm:text-xl leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-red-100 text-xs font-normal mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-4 flex-shrink-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowNotif(!showNotif);
              setShowProfile(false);
              setShowProfileModal(false);
              setShowSettingsModal(false);
              setShowForgotPassword(false);
            }}
            className="relative p-2 hover:bg-white/10 transition-colors"
            style={{ borderRadius: r }}
          >
            <Bell size={22} className="text-white" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 text-[#2B3235] text-[10px] font-black min-w-[18px] h-[18px] px-1 flex items-center justify-center"
                style={{ background: '#FFC107', borderRadius: 6 }}
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotif(false);
              setShowProfileModal(false);
              setShowSettingsModal(false);
              setShowForgotPassword(false);
            }}
            className="flex items-center gap-2 hover:bg-white/10 px-2 py-1.5 transition-colors"
            style={{ borderRadius: r }}
          >
            <div
              className="w-9 h-9 flex items-center justify-center text-[#2B3235] font-black text-sm"
              style={{ background: '#FFC107', borderRadius: r }}
            >
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-white text-xs font-bold leading-tight">{displayName}</p>
              <p className="text-red-100 text-[10px] font-medium">{roleLabel}</p>
            </div>
            <ChevronDown size={14} className="text-red-100 hidden sm:block" />
          </button>
          {showProfile && (
            <div className="absolute right-0 top-14 w-48 bg-white shadow-xl border border-gray-100 z-50 overflow-hidden" style={{ borderRadius: r }}>
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold" style={{ color: '#2B3235' }}>{displayName}</p>
                <p className="text-[11px]" style={{ color: '#2B3235', opacity: 0.55 }}>{roleLabel}</p>
              </div>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-gray-50"
                style={{ color: '#2B3235' }}
                onClick={() => {
                  setShowProfile(false);
                  setShowProfileModal(true);
                }}
              >
                My Profile
              </button>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-gray-50"
                style={{ color: '#2B3235' }}
                onClick={() => {
                  setShowProfile(false);
                  setShowSettingsModal(true);
                }}
              >
                Settings
              </button>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 border-t border-gray-100"
                onClick={handleSignOut}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {hasAnyOverlay && (
        <div className="fixed inset-0 z-40" onClick={closeAll} aria-hidden />
      )}

      {showNotif && (
        <div className="fixed inset-0 z-[60] p-4 md:p-8" onClick={() => setShowNotif(false)}>
          <div
            className="ml-auto w-full max-w-3xl h-full max-h-[85vh] bg-white shadow-2xl border border-gray-100 overflow-hidden flex flex-col"
            style={{ borderRadius: r }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-black text-base" style={{ color: '#2B3235' }}>Notifications</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: '#2B3235', opacity: 0.65 }}>
                  Request details and important events
                </p>
              </div>
              <button type="button" className="btn-outline-maroon text-xs py-2 px-3" onClick={() => setShowNotif(false)}>
                Close
              </button>
            </div>
            <div className="overflow-y-auto">
              {notifItems.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Bell size={48} className="mx-auto mb-3" style={{ color: '#D1D5DB' }} />
                  <p className="text-sm font-bold mb-1" style={{ color: '#2B3235' }}>No new notifications</p>
                  <p className="text-xs" style={{ color: '#2B3235', opacity: 0.65 }}>
                    You're all caught up! Check back later for updates.
                  </p>
                </div>
              ) : (
                notifItems.map((n) => {
                  const isMaintenance = n.notificationType === 'maintenance';
                  const isUrgent = n.priority === 'urgent' || n.priority === 'high';
                  
                  return (
                  <div 
                    key={n.id} 
                    className={`px-6 py-4 border-b border-gray-100 transition-colors cursor-pointer ${
                      isMaintenance 
                        ? (isUrgent ? 'bg-red-50 hover:bg-red-100' : 'bg-orange-50 hover:bg-orange-100')
                        : 'bg-[#FFFBFB] hover:bg-[#FFF5F5]'
                    }`}
                    onClick={() => handleViewRequest(n)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {isMaintenance && (
                          <div className={`p-2 rounded-lg flex-shrink-0 ${
                            isUrgent ? 'bg-red-100' : 'bg-orange-100'
                          }`}>
                            <AlertTriangle size={18} className={isUrgent ? 'text-red-600' : 'text-orange-600'} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span
                            className="inline-flex items-center text-[10px] font-black mb-1 px-2 py-0.5"
                            style={{
                              color: isMaintenance ? (isUrgent ? '#991B1B' : '#9A3412') : '#92400E',
                              background: isMaintenance ? (isUrgent ? '#FEE2E2' : '#FFEDD5') : '#FEF3C7',
                              borderRadius: 6,
                            }}
                          >
                            {isMaintenance ? (isUrgent ? '⚠️ URGENT' : 'Maintenance Report') : 'Pending Approval'}
                          </span>
                          <p className="text-sm font-bold truncate" style={{ color: '#2B3235' }}>{n.title}</p>
                          <p className="text-xs mt-1 truncate" style={{ color: '#2B3235', opacity: 0.85 }}>
                            <span className="font-bold">{isMaintenance ? 'Reported by:' : 'Requester:'}</span> {n.requester}
                          </p>
                          <p className="text-xs truncate" style={{ color: '#2B3235', opacity: 0.85 }}>
                            <span className="font-bold">{isMaintenance ? 'Issue:' : 'Activity:'}</span> {n.request}
                          </p>
                          <p className="text-xs truncate" style={{ color: '#2B3235', opacity: 0.85 }}>
                            <span className="font-bold">Location:</span> {n.location}
                          </p>
                          <p className="text-[11px] mt-2" style={{ color: '#2B3235', opacity: 0.55 }}>
                            {n.submittedAt} · {n.time}
                          </p>
                        </div>
                      </div>
                      <span 
                        className="text-[10px] font-black px-2 py-1 text-white flex-shrink-0" 
                        style={{ 
                          background: isMaintenance ? (isUrgent ? '#DC2626' : '#F97316') : '#800000',
                          borderRadius: 6 
                        }}
                      >
                        NEW
                      </span>
                    </div>
                    <div className="mt-3">
                      <button 
                        type="button" 
                        className={`text-xs py-2 px-3 font-bold rounded-lg transition-all ${
                          isMaintenance 
                            ? (isUrgent 
                                ? 'bg-red-600 text-white hover:bg-red-700' 
                                : 'bg-orange-600 text-white hover:bg-orange-700')
                            : 'btn-maroon'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewRequest(n);
                        }}
                      >
                        {isMaintenance ? 'View Maintenance Report' : 'View & Review Request'}
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div className="modal-overlay z-[70]" onClick={() => setShowProfileModal(false)}>
          <div
            className="bg-white w-full max-w-xl shadow-2xl border border-gray-100"
            style={{ borderRadius: r }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-gray-100" style={{ background: '#FFFBFB' }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center text-[#2B3235] font-black text-base" style={{ background: '#FFC107', borderRadius: 10 }}>
                  {initials}
                </div>
                <div>
                  <h3 className="font-black text-base" style={{ color: '#2B3235' }}>My Profile</h3>
                  <p className="text-xs font-semibold" style={{ color: '#2B3235', opacity: 0.65 }}>Account and identity details</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase" style={{ color: '#2B3235', opacity: 0.6 }}>Full Name</p>
                  <p className="text-sm font-semibold" style={{ color: '#2B3235' }}>{profileForm.fullName}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase" style={{ color: '#2B3235', opacity: 0.6 }}>Role</p>
                  <p className="text-sm font-semibold" style={{ color: '#2B3235' }}>{profileForm.role}</p>
                </div>
              </div>
              <p className="text-xs flex items-center gap-2" style={{ color: '#2B3235' }}><Mail size={14} className="text-[#800000]" /> {profileForm.email}</p>
              <p className="text-xs flex items-center gap-2" style={{ color: '#2B3235' }}><Phone size={14} className="text-[#800000]" /> {profileForm.phone}</p>
              <p className="text-xs flex items-center gap-2" style={{ color: '#2B3235' }}><BadgeCheck size={14} className="text-[#800000]" /> Account status: Verified</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="btn-maroon text-xs py-2.5 px-4"
                  onClick={() => {
                    setShowProfileModal(false);
                    setShowEditProfileModal(true);
                  }}
                >
                  Edit Profile
                </button>
                <button type="button" className="btn-outline-maroon text-xs py-2.5 px-4" onClick={() => setShowProfileModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditProfileModal && (
        <div className="modal-overlay z-[71]" onClick={() => setShowEditProfileModal(false)}>
          <div
            className="bg-white w-full max-w-md shadow-2xl border border-gray-100"
            style={{ borderRadius: r }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <User size={16} style={{ color: '#800000' }} />
              <h3 className="font-black text-sm" style={{ color: '#2B3235' }}>Edit Profile</h3>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="form-label">Full Name</label>
                <input className="form-input" value={profileForm.fullName} onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Role</label>
                <input className="form-input" value={profileForm.role} onChange={(e) => setProfileForm((f) => ({ ...f, role: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input className="form-input" value={profileForm.email} onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="form-input" value={profileForm.phone} onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-maroon text-xs py-2.5 px-4" onClick={() => setShowEditProfileModal(false)}>
                  Save Changes
                </button>
                <button type="button" className="btn-outline-maroon text-xs py-2.5 px-4" onClick={() => setShowEditProfileModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="modal-overlay z-[70]" onClick={() => setShowSettingsModal(false)}>
          <div
            className="bg-white w-full max-w-lg shadow-xl border border-gray-100"
            style={{ borderRadius: r }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Settings size={16} style={{ color: '#800000' }} />
              <h3 className="font-black text-sm" style={{ color: '#2B3235' }}>Settings</h3>
            </div>
            <div className="p-5 space-y-3">
              <button type="button" className="w-full text-left p-3 border border-gray-100 hover:bg-gray-50" style={{ borderRadius: r, color: '#2B3235' }}>
                <div className="flex items-center gap-2 font-bold text-sm"><FileText size={14} className="text-[#800000]" /> Preferences</div>
                <p className="text-xs mt-1 opacity-70">Configure notification and display options</p>
              </button>
              <button type="button" className="w-full text-left p-3 border border-gray-100 hover:bg-gray-50" style={{ borderRadius: r, color: '#2B3235' }}>
                <div className="flex items-center gap-2 font-bold text-sm"><Clock3 size={14} className="text-[#800000]" /> Session & Security</div>
                <p className="text-xs mt-1 opacity-70">Manage devices and active sessions</p>
              </button>
              <button
                type="button"
                className="w-full text-left p-3 border border-gray-100 hover:bg-gray-50"
                style={{ borderRadius: r, color: '#2B3235' }}
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowForgotPassword(true);
                }}
              >
                <div className="flex items-center gap-2 font-bold text-sm"><LockKeyhole size={14} className="text-[#800000]" /> Forgot Password</div>
                <p className="text-xs mt-1 opacity-70">Send reset link to your registered email</p>
              </button>
              <div className="pt-1">
                <button type="button" className="btn-outline-maroon text-xs py-2.5 px-4" onClick={() => setShowSettingsModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForgotPassword && (
        <div className="modal-overlay z-[70]" onClick={() => setShowForgotPassword(false)}>
          <div
            className="bg-white w-full max-w-md shadow-xl border border-gray-100"
            style={{ borderRadius: r }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-black text-sm" style={{ color: '#2B3235' }}>Forgot Password</h3>
            </div>
            <div className="p-5">
              <p className="text-xs mb-3" style={{ color: '#2B3235', opacity: 0.75 }}>
                Send a password reset link to your account email.
              </p>
              <input className="form-input mb-3" value="registrar@swu.edu.ph" readOnly />
              <div className="flex gap-2">
                <button type="button" className="btn-maroon text-xs py-2.5 px-4">Send reset link</button>
                <button type="button" className="btn-outline-maroon text-xs py-2.5 px-4" onClick={() => setShowForgotPassword(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
