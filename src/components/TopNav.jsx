import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, ChevronDown, User, Settings, LockKeyhole, Mail, Phone, BadgeCheck, FileText, Clock3, Menu, AlertTriangle, CheckCheck,
} from 'lucide-react';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../constants/layout';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { getInitials } from '../firebase/authHelpers';
import { getActivePendingRecord, isReservationActionable } from '../constants/approvalWorkflow';
import { subscribeMaintenanceReports } from '../services/maintenanceService';
import { getRoleLabel } from '../constants/rolePermissions';
import {
  subscribeUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notificationService';

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
  const [dbNotifications, setDbNotifications] = useState([]);
  const [hasSeenBell, setHasSeenBell] = useState(false);

  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const saved = localStorage.getItem(`read_notifs_${profile?.uid || 'guest'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const markNotifIdAsRead = (id) => {
    if (!id) return;
    setReadNotifIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem(`read_notifs_${profile?.uid || 'guest'}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

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

  // Subscribe to user notifications in Firestore
  useEffect(() => {
    if (!profile) return undefined;
    return subscribeUserNotifications(
      profile,
      (items) => setDbNotifications(items),
      (err) => console.error('Error subscribing to notifications:', err)
    );
  }, [profile]);

  // Subscribe to maintenance reports for GSD
  useEffect(() => {
    if (!isGsd) return;

    const unsubscribe = subscribeMaintenanceReports(
      (reports) => {
        const unacknowledgedReports = reports.filter(r => 
          r.status === 'pending' || r.status === 'acknowledged'
        );
        setMaintenanceReports(unacknowledgedReports);
      },
      (error) => console.error('Error loading maintenance reports:', error)
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

  // Generate notifications from Firestore notifications, pending approval requests, and maintenance reports
  const notifItems = useMemo(() => {
    const approvalNotifications = [];
    const maintenanceNotifications = [];

    // 1. In-app Firestore notifications
    const dbNotifsFormatted = (dbNotifications || []).map((n) => {
      const isLocallyRead = readNotifIds.includes(n.id);
      const resId = n.reservationId || n.resId || n.rawItem?.reservationId;
      const resType = n.reservationType || n.resType || n.rawItem?.reservationType || 'academic';

      let computedLink = n.link;
      if (!computedLink || computedLink.includes('undefined')) {
        if (resId && resId !== 'undefined') {
          computedLink = resType === 'academic' ? `/academic-request/${resId}` : `/request/${resId}`;
        } else {
          computedLink = '/approvals';
        }
      }

      return {
        id: n.id,
        isDbNotif: true,
        type: n.type || 'info',
        notificationType: n.type || 'system',
        title: n.title || 'System Notification',
        message: n.message || '',
        requester: n.userEmail || n.userId || 'System',
        request: n.message || 'Notification detail',
        location: 'System Alert',
        submittedAt: formatDate(n.createdAt),
        time: getTimeAgo(n.createdAt),
        unread: !n.read && !isLocallyRead,
        reservationId: resId,
        reservationType: resType,
        link: computedLink,
        rawItem: n,
      };
    });

    // Deduplicate dbNotifsFormatted so only the latest notification per reservation is kept
    const dbNotifsDeduplicated = [];
    const seenResIds = new Set();

    dbNotifsFormatted.forEach((n) => {
      if (n.reservationId) {
        if (seenResIds.has(n.reservationId)) return;
        seenResIds.add(n.reservationId);
      }
      dbNotifsDeduplicated.push(n);
    });

    // 2. Approval notifications (only add if not already covered by a real-time db notification)
    if (requests && profile?.role && profile) {
      requests.forEach((req) => {
        if (!isReservationActionable(req, profile.role, profile)) return;
        if (req.id && seenResIds.has(req.id)) return; // Exclude duplicate notification card for the same reservation

        const timeAgo = getTimeAgo(req.createdAt);
        const requestType = req.type === 'academic' ? 'Academic' : 'Non-Academic';
        const notifId = `appr_${req.id}`;
        const isLocallyRead = readNotifIds.includes(notifId);

        approvalNotifications.push({
          id: notifId,
          type: 'Pending',
          notificationType: 'approval',
          title: `${requestType} reservation needs approval`,
          requester: req.requestedBy || req.requestor || 'Unknown',
          request: req.activity || req.title || 'Room Reservation',
          location: req.designatedVenue || req.building || 'N/A',
          submittedAt: formatDate(req.createdAt),
          time: timeAgo,
          unread: !isLocallyRead,
          reservationId: req.id,
          reservationType: req.type,
          link: req.type === 'academic' ? `/academic-request/${req.id}` : `/request/${req.id}`,
        });
      });
    }

    // 3. Maintenance notifications (for GSD only)
    if (isGsd && maintenanceReports.length > 0) {
      maintenanceReports.forEach((report) => {
        const timeAgo = getTimeAgo(report.createdAt);
        const notifId = `maint_${report.id}`;
        const isLocallyRead = readNotifIds.includes(notifId);
        const priorityLabel = report.priority === 'urgent' ? 'URGENT' :
                            report.priority === 'high' ? 'High Priority' :
                            report.priority === 'medium' ? 'Medium Priority' : 'Low Priority';

        maintenanceNotifications.push({
          id: notifId,
          type: report.priority === 'urgent' || report.priority === 'high' ? 'Urgent' : 'Info',
          notificationType: 'maintenance',
          title: `${priorityLabel} maintenance report`,
          requester: report.reportedByName || 'Unknown',
          request: report.issue,
          location: `${report.roomName} - ${report.buildingName}`,
          submittedAt: formatDate(report.createdAt),
          time: timeAgo,
          unread: !isLocallyRead,
          reportId: report.id,
          priority: report.priority,
        });
      });
    }

    // Combine and sort by unread first, then by date
    return [...dbNotifsDeduplicated, ...maintenanceNotifications, ...approvalNotifications].sort((a, b) => {
      if (a.unread !== b.unread) return a.unread ? -1 : 1;
      const aTime = a.submittedAt === 'N/A' ? 0 : new Date(a.submittedAt).getTime();
      const bTime = b.submittedAt === 'N/A' ? 0 : new Date(b.submittedAt).getTime();
      return bTime - aTime;
    });
  }, [dbNotifications, requests, profile, maintenanceReports, isGsd, readNotifIds]);

  const unreadCount = useMemo(() => {
    return notifItems.filter((n) => n.unread).length;
  }, [notifItems]);

  const prevCountRef = React.useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setHasSeenBell(false);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  const handleSignOut = async () => {
    closeAll();
    await logout();
    navigate('/login');
  };

  const handleViewRequest = async (notification) => {
    setShowNotif(false);
    
    if (notification.id) {
      markNotifIdAsRead(notification.id);
    }

    // Mark as read in Firestore if it's a db notification
    if (notification.isDbNotif && notification.rawItem?.id) {
      await markNotificationAsRead(notification.rawItem.id);
    } else if (notification.isDbNotif && notification.id) {
      await markNotificationAsRead(notification.id);
    }

    const nType = notification.notificationType || notification.type;
    const raw = notification.rawItem || {};
    const resId = notification.reservationId || raw.reservationId || raw.resId;
    const resType = notification.reservationType || raw.reservationType || raw.resType || 'academic';
    const targetLink = notification.link || raw.link;

    if (targetLink && !targetLink.includes('undefined')) {
      navigate(targetLink);
      return;
    }

    if (resId && resId !== 'undefined') {
      const path = resType === 'academic' ? `/academic-request/${resId}` : `/request/${resId}`;
      navigate(path);
      return;
    }

    if (nType === 'access_granted' || nType === 'course_scheduling') {
      navigate('/course-scheduling');
    } else if (nType === 'maintenance') {
      navigate('/maintenance-dashboard');
    } else {
      navigate('/approvals');
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifItems.filter((n) => n.unread).map((n) => n.id);
    unreadIds.forEach((id) => markNotifIdAsRead(id));

    if (dbNotifications.length > 0) {
      await markAllNotificationsAsRead(dbNotifications);
    }
  };

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
              const nextShow = !showNotif;
              setShowNotif(nextShow);
              setHasSeenBell(true); // Resets bell counter icon number to normal!
              setShowProfile(false);
              setShowProfileModal(false);
              setShowSettingsModal(false);
              setShowForgotPassword(false);
            }}
            className="relative p-2 hover:bg-white/10 transition-colors"
            style={{ borderRadius: r }}
            title="Notifications"
          >
            <Bell size={22} className="text-white" />
            {unreadCount > 0 && !hasSeenBell && (
              <span
                className="absolute -top-0.5 -right-0.5 text-[#2B3235] text-[10px] font-black min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow-xs"
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
            <div className="absolute right-0 top-14 w-52 bg-white shadow-xl border border-gray-100 z-50 overflow-hidden" style={{ borderRadius: r }}>
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold" style={{ color: '#2B3235' }}>{displayName}</p>
                <p className="text-[11px]" style={{ color: '#2B3235', opacity: 0.55 }}>{roleLabel}</p>
              </div>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-red-50/50 flex items-center gap-2"
                style={{ color: '#2B3235' }}
                onClick={() => {
                  setShowProfile(false);
                  navigate('/profile-settings');
                }}
              >
                <Settings size={15} className="text-[#800000]" />
                Profile & Settings
              </button>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 border-t border-gray-100 flex items-center gap-2"
                onClick={handleSignOut}
              >
                <User size={15} className="text-red-600" />
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
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-black text-base" style={{ color: '#2B3235' }}>Notifications</p>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#800000] text-white">
                      {unreadCount} Unread
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium mt-0.5" style={{ color: '#2B3235', opacity: 0.65 }}>
                  System alerts, scheduling access, and request updates
                </p>
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs font-extrabold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1"
                  >
                    <CheckCheck size={14} className="text-[#800000]" />
                    Mark all as read
                  </button>
                )}
                <button type="button" className="btn-outline-maroon text-xs py-1.5 px-3" onClick={() => setShowNotif(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {notifItems.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <Bell size={48} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-bold mb-1" style={{ color: '#2B3235' }}>No new notifications</p>
                  <p className="text-xs text-gray-500">
                    You're all caught up! Check back later for updates.
                  </p>
                </div>
              ) : (
                notifItems.map((n) => {
                  const isMaintenance = n.notificationType === 'maintenance';
                  const isUrgent = n.priority === 'urgent' || n.priority === 'high';
                  const isUnread = n.unread;
                  
                  return (
                    <div 
                      key={n.id} 
                      className={`px-6 py-4 transition-all cursor-pointer border-b border-gray-100 ${
                        isUnread
                          ? isMaintenance
                            ? (isUrgent ? 'bg-red-100/90 hover:bg-red-200/80 border-l-4 border-l-red-600 font-semibold' : 'bg-orange-100/90 hover:bg-orange-200/80 border-l-4 border-l-orange-500 font-semibold')
                            : 'bg-red-100/90 hover:bg-red-200/80 border-l-4 border-l-[#800000] font-semibold text-gray-900 shadow-2xs'
                          : 'bg-white hover:bg-gray-50/80 border-l-4 border-l-transparent text-gray-600'
                      }`}
                      onClick={() => handleViewRequest(n)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {isMaintenance ? (
                            <div className={`p-2 rounded-lg flex-shrink-0 ${
                              isUrgent ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'
                            }`}>
                              <AlertTriangle size={18} className={isUrgent ? 'text-red-700' : 'text-orange-700'} />
                            </div>
                          ) : (
                            <div className={`p-2 rounded-lg flex-shrink-0 ${
                              isUnread ? 'bg-red-200 text-[#800000]' : 'bg-gray-100 text-gray-500'
                            }`}>
                              <Bell size={18} />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span
                                className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-md"
                                style={{
                                  color: isMaintenance ? (isUrgent ? '#991B1B' : '#9A3412') : '#800000',
                                  background: isMaintenance ? (isUrgent ? '#FEE2E2' : '#FFEDD5') : '#FEE2E2',
                                }}
                              >
                                {isMaintenance
                                  ? (isUrgent ? '⚠️ URGENT MAINTENANCE' : 'Maintenance Report')
                                  : n.notificationType === 'access_granted'
                                    ? '📋 Course Scheduling Access'
                                    : 'Pending Approval'}
                              </span>

                              {isUnread ? (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-[#800000] text-white">
                                  UNREAD
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                                  Read
                                </span>
                              )}
                            </div>

                            <p className={`text-sm ${isUnread ? 'font-black text-gray-900' : 'font-semibold text-gray-700'} truncate`}>
                              {n.title}
                            </p>
                            {n.message && (
                              <p className="text-xs mt-1 text-gray-700 leading-relaxed font-medium">
                                {n.message}
                              </p>
                            )}
                            {!n.isDbNotif && (
                              <>
                                <p className="text-xs mt-1 truncate text-gray-700">
                                  <span className="font-bold">{isMaintenance ? 'Reported by:' : 'Requester:'}</span> {n.requester}
                                </p>
                                <p className="text-xs truncate text-gray-700">
                                  <span className="font-bold">{isMaintenance ? 'Issue:' : 'Activity:'}</span> {n.request}
                                </p>
                                <p className="text-xs truncate text-gray-700">
                                  <span className="font-bold">Location:</span> {n.location}
                                </p>
                              </>
                            )}
                            <p className="text-[11px] mt-2 text-gray-400 font-medium">
                              {n.submittedAt} · {n.time}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <button 
                          type="button" 
                          className={`text-xs py-1.5 px-3 font-bold rounded-lg transition-all ${
                            isUnread ? 'bg-[#800000] text-white hover:bg-[#600000]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewRequest(n);
                          }}
                        >
                          {n.notificationType === 'access_granted'
                            ? 'Open Course Scheduling'
                            : isMaintenance
                              ? 'View Maintenance Report'
                              : 'View Details'}
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
