import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bell, ChevronDown, User, Settings, LockKeyhole, Mail, Phone, BadgeCheck, FileText, Clock3, Menu, AlertTriangle, CheckCheck, MessageSquare, MessageCircle, LogOut, Wrench, CheckCircle,
} from 'lucide-react';
import { NAV_WIDTH_PX, TOP_NAV_HEIGHT_PX } from '../constants/layout';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { getInitials } from '../firebase/authHelpers';
import { getActivePendingRecord, isReservationActionable } from '../constants/approvalWorkflow';
import { subscribeAllUserChats, extractAllKeys } from '../services/chatService';
import { subscribeMaintenanceReports } from '../services/maintenanceService';
import { getRoleLabel } from '../constants/rolePermissions';
import {
  subscribeUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/notificationService';
import chatIcon from '../assets/chat-icon.png';
import navBgTexture from '../assets/login-bg.jpg';

export default function TopNav({ title, subtitle, isDesktop = true, desktopLeftOffset = NAV_WIDTH_PX, onToggleNav = () => {} }) {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { requests } = useApp();
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSignOutConfirmModal, setShowSignOutConfirmModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [maintenanceReports, setMaintenanceReports] = useState([]);
  const [dbNotifications, setDbNotifications] = useState([]);
  const [bellSeenNotifIds, setBellSeenNotifIds] = useState([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [notificationRedirect, setNotificationRedirect] = useState(null);
  const [openingNotificationId, setOpeningNotificationId] = useState(null);
  const redirectTimerRef = useRef(null);
  const openingNotificationIdsRef = useRef(new Set());

  useEffect(() => () => {
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
  }, []);

  const redirectFromNotification = (path, notification) => {
    const destination = path.startsWith('/course-scheduling')
      ? 'Course Scheduling'
      : path.startsWith('/approvals')
        ? 'Approval Management'
        : path.startsWith('/maintenance')
          ? 'Maintenance Dashboard'
          : path.includes('/request/')
            ? 'Request Details'
            : 'the requested page';
    setNotificationRedirect({ destination, title: notification?.title || 'Opening notification' });
    if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = setTimeout(() => {
      setNotificationRedirect(null);
      openingNotificationIdsRef.current.clear();
      setOpeningNotificationId(null);
      navigate(path);
    }, 700);
  };

  const currentUserObj = useMemo(() => {
    return {
      uid: profile?.uid || profile?.id,
      email: profile?.email,
      name: profile?.displayName || profile?.name,
    };
  }, [profile]);

  useEffect(() => {
    if (!currentUserObj.email && !currentUserObj.uid) return;
    const unsub = subscribeAllUserChats(currentUserObj, (chats) => {
      const userKeys = extractAllKeys(currentUserObj);
      const count = (chats || []).filter((msg) => {
        const rKey = String(msg.receiverKey || msg.receiverEmail || msg.receiverUid || '').toLowerCase();
        const isReceiver = userKeys.includes(rKey);
        return isReceiver && !msg.read;
      }).length;
      setUnreadChatCount(count);
    });
    return () => unsub();
  }, [currentUserObj]);

  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      const saved = localStorage.getItem(`read_notifs_${profile?.uid || 'guest'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`seen_bell_notifs_${profile?.uid || 'guest'}`);
      setBellSeenNotifIds(saved ? JSON.parse(saved) : []);
    } catch {
      setBellSeenNotifIds([]);
    }
  }, [profile?.uid]);

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
        } else if (n.type === 'access_granted' || n.type === 'course_scheduling') {
          computedLink = '/course-scheduling';
        } else if (n.type === 'maintenance' && isGsd) {
          computedLink = '/maintenance-dashboard';
        } else if (n.type === 'approval' || n.notificationType === 'approval') {
          computedLink = '/approvals';
        } else {
          computedLink = null;
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

  const unseenBellCount = useMemo(() => notifItems.filter(
    (notification) => notification.unread && !bellSeenNotifIds.includes(notification.id)
  ).length, [notifItems, bellSeenNotifIds]);

  const markBellNotificationsAsSeen = () => {
    const unreadIds = notifItems.filter((notification) => notification.unread).map((notification) => notification.id);
    setBellSeenNotifIds((current) => {
      const next = Array.from(new Set([...current, ...unreadIds]));
      try {
        localStorage.setItem(`seen_bell_notifs_${profile?.uid || 'guest'}`, JSON.stringify(next));
      } catch (error) {
        console.warn('Could not persist seen notification badge state:', error);
      }
      return next;
    });
  };

  const handleSignOut = async () => {
    closeAll();
    await logout();
    navigate('/login');
  };

  const handleViewRequest = async (notification) => {
    const notificationKey = String(notification?.id || notification?.rawItem?.id || `${notification?.title}-${notification?.submittedAt}`);
    if (openingNotificationIdsRef.current.has(notificationKey)) return;
    openingNotificationIdsRef.current.add(notificationKey);
    setOpeningNotificationId(notificationKey);
    setShowNotif(false);
    
    // A notification can change from unread to read only once. Reopening an
    // already-read item may navigate again, but it must not affect the count.
    if (notification.unread && notification.id) {
      markNotifIdAsRead(notification.id);
    }

    // Mark as read in Firestore if it's a db notification
    if (notification.unread && notification.isDbNotif && notification.rawItem?.id) {
      await markNotificationAsRead(notification.rawItem.id);
    } else if (notification.unread && notification.isDbNotif && notification.id) {
      await markNotificationAsRead(notification.id);
    }

    const nType = notification.notificationType || notification.type;
    const raw = notification.rawItem || {};
    const resId = notification.reservationId || raw.reservationId || raw.resId;
    const resType = notification.reservationType || raw.reservationType || raw.resType || 'academic';
    const targetLink = notification.link || raw.link;

    if (targetLink && !targetLink.includes('undefined')) {
      redirectFromNotification(targetLink, notification);
      return;
    }

    if (resId && resId !== 'undefined') {
      const path = resType === 'academic' ? `/academic-request/${resId}` : `/request/${resId}`;
      redirectFromNotification(path, notification);
      return;
    }

    if (nType === 'access_granted' || nType === 'course_scheduling') {
      redirectFromNotification('/course-scheduling', notification);
    } else if (nType === 'maintenance') {
      redirectFromNotification('/maintenance-dashboard', notification);
    } else {
      redirectFromNotification('/approvals', notification);
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
    showNotif || showProfileModal || showEditProfileModal || showSettingsModal || showForgotPassword;

  return (
    <div
      className="fixed top-0 right-0 z-40 flex items-center justify-between px-3 sm:px-4 lg:px-6 print:hidden shadow-md overflow-hidden"
      style={{
        left: isDesktop ? desktopLeftOffset : 0,
        height: TOP_NAV_HEIGHT_PX,
        background: '#7A0808',
      }}
    >
      {/* Top Edge Ambient Highlight Sheen */}
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none z-10" />

      {/* Pure SWU Maroon Shaded Background (No Patterns) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-hidden"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Base Shaded Maroon Background Gradient */}
          <linearGradient id="cleanMaroonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4A0303" />
            <stop offset="30%" stopColor="#7A0808" />
            <stop offset="60%" stopColor="#8C0D0D" />
            <stop offset="85%" stopColor="#6E0606" />
            <stop offset="100%" stopColor="#450101" />
          </linearGradient>

          <radialGradient id="subtleTopGlow" cx="50%" cy="0%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#7A0808" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Clean Shaded Maroon Base Color */}
        <rect width="100%" height="100%" fill="url(#cleanMaroonGrad)" />
        <rect width="100%" height="100%" fill="url(#subtleTopGlow)" />
      </svg>

      <div className="min-w-0 flex items-center gap-2 sm:gap-3 relative z-10">
        {!isDesktop && (
          <button
            type="button"
            onClick={onToggleNav}
            className="relative p-2 hover:bg-white/15 transition-colors flex-shrink-0"
            style={{ borderRadius: r }}
            aria-label="Open sidebar"
          >
            <Menu size={20} className="text-white" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-white font-black text-lg sm:text-xl leading-tight truncate tracking-tight drop-shadow-xs">
            {title}
          </h1>
          {subtitle && <p className="text-red-100/90 text-xs font-semibold mt-0.5 tracking-wide">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 relative z-10">
        {/* Message Action Button */}
        <button
          type="button"
          onClick={() => {
            navigate('/messages');
            setShowNotif(false);
            setShowProfile(false);
          }}
          className="relative w-10 h-10 bg-white/20 hover:bg-white/30 backdrop-blur-xs border border-white/40 rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-300 shadow-xs hover:shadow-md group active:scale-95"
          title="Messages & Chat Coordination"
        >
          <MessageCircle
            size={20}
            className="text-white group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300 drop-shadow-xs"
          />

          {/* Unread Chat Message Count Badge (100% Real-Time) */}
          {unreadChatCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 flex items-center justify-center rounded-full text-[10px] font-black shadow-md bg-[#F59E0B] text-white border-2 border-[#7A0808] animate-in zoom-in duration-200">
              {unreadChatCount}
            </span>
          )}
        </button>

        {/* Notifications Bell Button */}
        <button
          type="button"
          onClick={() => {
            const nextShow = !showNotif;
            setShowNotif(nextShow);
            if (nextShow) markBellNotificationsAsSeen();
            setShowProfile(false);
            setShowProfileModal(false);
            setShowSettingsModal(false);
            setShowForgotPassword(false);
          }}
          className="relative w-10 h-10 bg-white/20 hover:bg-white/30 backdrop-blur-xs border border-white/40 rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-300 shadow-xs hover:shadow-md group active:scale-95"
          title="Notifications"
        >
          <Bell
            size={20}
            className={`text-white transition-transform duration-300 drop-shadow-xs ${
              unseenBellCount > 0 ? 'animate-bell-ring' : 'group-hover-bell-ring'
            }`}
          />

          {/* Real-Time Notification Count Badge */}
          {unseenBellCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 flex items-center justify-center rounded-full text-[10px] font-black shadow-md bg-[#F59E0B] text-white border-2 border-[#7A0808] animate-in zoom-in duration-200">
              {unseenBellCount}
            </span>
          )}
        </button>

        {/* User Profile Button (No Transparent Container) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowProfile(!showProfile);
            setShowNotif(false);
          }}
          className="flex items-center gap-2.5 py-1 px-1.5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer active:scale-95"
        >
          {(profile?.photoURL || profile?.avatarUrl || profile?.photoUrl) ? (
            <img
              src={profile.photoURL || profile.avatarUrl || profile.photoUrl}
              alt={displayName}
              className="w-10 h-10 rounded-full object-cover shadow-xs flex-shrink-0"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#2B3235] font-black text-sm shadow-xs flex-shrink-0"
              style={{ background: '#FFC107' }}
            >
              {initials}
            </div>
          )}
          <div className="text-left hidden sm:block">
            <p className="text-white text-xs font-bold leading-tight truncate max-w-[140px]">{displayName}</p>
            <p className="text-red-100 text-[10px] font-medium leading-tight">{roleLabel}</p>
          </div>
          <ChevronDown size={14} className="text-red-100 hidden sm:block" />
        </button>
      </div>

      {/* Profile Dropdown Menu Overlay */}
      {showProfile && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-end px-3 sm:px-4 lg:px-6 pt-14 pointer-events-auto"
          onClick={() => setShowProfile(false)}
        >
          <div
            className="w-64 bg-white shadow-2xl border border-gray-200 overflow-hidden rounded-2xl animate-in fade-in zoom-in-95 duration-150 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-gradient-to-br from-red-50 to-amber-50/40 border-b border-gray-100 flex items-center gap-3">
              {(profile?.photoURL || profile?.avatarUrl || profile?.photoUrl) ? (
                <img
                  src={profile.photoURL || profile.avatarUrl || profile.photoUrl}
                  alt={displayName}
                  className="w-11 h-11 rounded-full object-cover shadow-xs flex-shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-[#7A0808] text-white font-black text-base flex items-center justify-center shadow-xs flex-shrink-0">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-gray-900 truncate">{displayName}</p>
                <p className="text-[11px] text-gray-500 truncate">{profile?.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-[#7A0808] text-white">
                  {roleLabel}
                </span>
              </div>
            </div>

            <div className="p-2 space-y-1">
              <button
                type="button"
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold text-gray-700 hover:bg-red-50/70 hover:text-[#7A0808] rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfile(false);
                  navigate('/profile-settings');
                }}
              >
                <Settings size={16} className="text-[#7A0808]" />
                Profile & Settings
              </button>
              <button
                type="button"
                className="w-full text-left px-3.5 py-2.5 text-xs font-bold bg-[#FFF0F0] text-[#7A0808] hover:bg-[#FFE5E5] border border-[#FFCACA] rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfile(false);
                  setShowSignOutConfirmModal(true);
                }}
              >
                <LogOut size={16} className="text-[#7A0808]" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirmModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowSignOutConfirmModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden p-6 animate-in zoom-in-95 duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF0F0] text-[#7A0808] border border-[#FFCACA] flex items-center justify-center flex-shrink-0">
                <LogOut size={22} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-gray-900">Sign Out Confirmation</h3>
                <p className="text-xs text-gray-500 mt-0.5">Are you sure you want to log out of SWU-IFSS?</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 mb-6 bg-gray-50 p-3 rounded-xl border border-gray-100 leading-relaxed">
              You will be signed out of your current session. Any unsaved form progress will be lost.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSignOutConfirmModal(false)}
                className="btn-ghost-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSignOutConfirmModal(false);
                  handleSignOut();
                }}
                className="btn-delete cursor-pointer"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {hasAnyOverlay && (
        <div className="fixed inset-0 z-40" onClick={closeAll} aria-hidden />
      )}

      {showNotif && (
        <div className="fixed inset-0 z-[60] p-4 md:p-8" onClick={() => setShowNotif(false)}>
          <div
            className="ml-auto w-full max-w-3xl h-full max-h-[85vh] bg-slate-50 shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
            style={{ borderRadius: r }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Container */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white shadow-2xs">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-[#7A0808]">
                    <Bell size={16} />
                  </div>
                  <p className="font-black text-base text-[#2B3235]">Notifications</p>
                  {unreadCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#7A0808] text-white shadow-xs">
                      {unreadCount} Unread
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium mt-1 text-gray-500">
                  System alerts, scheduling access, and request updates
                </p>
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs font-extrabold px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1.5"
                  >
                    <CheckCheck size={14} className="text-[#7A0808]" />
                    Mark all as read
                  </button>
                )}
                <button type="button" className="btn-outline-maroon text-xs py-1.5 px-3 rounded-xl" onClick={() => setShowNotif(false)}>
                  Close
                </button>
              </div>
            </div>

            {/* Notification List Items Wrapped in Container Cards */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {notifItems.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-gray-300">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center text-gray-400">
                    <Bell size={28} />
                  </div>
                  <p className="text-sm font-bold text-gray-800 mb-1">No notifications</p>
                  <p className="text-xs text-gray-500">
                    You're all caught up! Updates will appear here when available.
                  </p>
                </div>
              ) : (
                notifItems.map((n) => {
                  const isMaintenanceReport = n.notificationType === 'maintenance' && isGsd;
                  const isMaintenanceAcknowledged = n.notificationType === 'report_acknowledged' || n.type === 'report_acknowledged' || n.rawItem?.type === 'report_acknowledged' || n.title?.toLowerCase().includes('maintenance report acknowledged');
                  const isMaintenanceResolved = n.notificationType === 'maintenance_resolved' || n.type === 'maintenance_resolved';
                  const isMaintenanceScheduled = n.notificationType === 'maintenance_scheduled' || n.type === 'maintenance_scheduled';
                  const isMaintenanceInfo = isMaintenanceAcknowledged || isMaintenanceResolved || isMaintenanceScheduled || (!isGsd && (n.notificationType === 'maintenance' || n.type === 'report_acknowledged' || n.title?.toLowerCase().includes('maintenance')));
                  const isMaintenance = isMaintenanceReport || isMaintenanceInfo || n.notificationType === 'maintenance' || n.type === 'maintenance';

                  const isUrgent = n.priority === 'urgent' || n.priority === 'high';
                  const isUnread = n.unread;

                  let badgeLabel = 'Pending Approval';
                  let badgeStyle = { color: '#7A0808', background: '#FEE2E2' };

                  if (isMaintenanceAcknowledged) {
                    badgeLabel = '✓ Maintenance Acknowledged';
                    badgeStyle = { color: '#065F46', background: '#D1FAE5' };
                  } else if (isMaintenanceResolved) {
                    badgeLabel = '✓ Maintenance Resolved';
                    badgeStyle = { color: '#065F46', background: '#D1FAE5' };
                  } else if (isMaintenanceScheduled) {
                    badgeLabel = '📅 Maintenance Scheduled';
                    badgeStyle = { color: '#9A3412', background: '#FFEDD5' };
                  } else if (isMaintenanceReport) {
                    badgeLabel = isUrgent ? '⚠️ URGENT MAINTENANCE' : 'Maintenance Report';
                    badgeStyle = { color: isUrgent ? '#991B1B' : '#9A3412', background: isUrgent ? '#FEE2E2' : '#FFEDD5' };
                  } else if (n.notificationType === 'access_granted') {
                    badgeLabel = '📋 Course Scheduling Access';
                    badgeStyle = { color: '#1E40AF', background: '#DBEAFE' };
                  } else if (n.notificationType === 'reservation_approved') {
                    badgeLabel = '✓ Reservation Approved';
                    badgeStyle = { color: '#065F46', background: '#D1FAE5' };
                  } else if (n.notificationType === 'reservation_rejected') {
                    badgeLabel = '✕ Reservation Rejected';
                    badgeStyle = { color: '#991B1B', background: '#FEE2E2' };
                  } else if (n.notificationType === 'reservation_cancelled') {
                    badgeLabel = '✕ Reservation Cancelled';
                    badgeStyle = { color: '#6B7280', background: '#F3F4F6' };
                  } else if (n.notificationType === 'no_class_day') {
                    badgeLabel = '📢 School Notice';
                    badgeStyle = { color: '#1E40AF', background: '#DBEAFE' };
                  }
                  
                  return (
                    <div 
                      key={n.id} 
                      className={`p-4 transition-all ${isMaintenanceInfo ? 'cursor-default' : openingNotificationId === String(n.id || n.rawItem?.id || `${n.title}-${n.submittedAt}`) ? 'cursor-wait opacity-70 pointer-events-none' : 'cursor-pointer'} rounded-2xl border ${
                        isUnread
                          ? isMaintenance
                            ? (isUrgent ? 'bg-red-50/90 hover:bg-red-100/90 border-red-300 shadow-sm' : isMaintenanceAcknowledged || isMaintenanceResolved ? 'bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-300 shadow-sm' : 'bg-orange-50/90 hover:bg-orange-100/90 border-orange-300 shadow-sm')
                            : 'bg-white hover:bg-red-50/40 border-red-200 shadow-sm ring-1 ring-red-100'
                          : 'bg-white hover:bg-slate-100/80 border-slate-200/80 text-gray-600'
                      }`}
                      onClick={() => {
                        if (isMaintenanceInfo) {
                          if (n.id) markNotifIdAsRead(n.id);
                          if (n.isDbNotif && (n.rawItem?.id || n.id)) {
                            markNotificationAsRead(n.rawItem?.id || n.id);
                          }
                        } else {
                          handleViewRequest(n);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3.5">
                        {isMaintenance ? (
                          <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                            isMaintenanceAcknowledged || isMaintenanceResolved
                              ? 'bg-emerald-100 text-emerald-800'
                              : isUrgent
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'
                          }`}>
                            {isMaintenanceAcknowledged || isMaintenanceResolved ? (
                              <CheckCircle size={18} className="text-emerald-700" />
                            ) : isUrgent ? (
                              <AlertTriangle size={18} className="text-red-700" />
                            ) : (
                              <Wrench size={18} className="text-orange-700" />
                            )}
                          </div>
                        ) : (
                          <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                            isUnread ? 'bg-red-100 text-[#7A0808]' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Bell size={18} />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                            <span
                              className="inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-md"
                              style={{
                                color: badgeStyle.color,
                                background: badgeStyle.background,
                              }}
                            >
                              {badgeLabel}
                            </span>

                            {isUnread ? (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-[#7A0808] text-white">
                                UNREAD
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                Read
                              </span>
                            )}
                          </div>

                          <p className={`text-sm ${isUnread ? 'font-black text-gray-900' : 'font-bold text-gray-800'} truncate`}>
                            {n.title}
                          </p>
                          {n.message && (
                            <p className="text-xs mt-1 text-gray-600 leading-relaxed font-medium">
                              {n.message}
                            </p>
                          )}
                          {!n.isDbNotif && (
                            <div className="mt-2.5 p-2.5 bg-slate-50/80 border border-slate-100 rounded-xl text-xs space-y-0.5">
                              <p className="truncate text-gray-700">
                                <span className="font-bold">{isMaintenance ? 'Reported by:' : 'Requester:'}</span> {n.requester}
                              </p>
                              <p className="truncate text-gray-700">
                                <span className="font-bold">{isMaintenance ? 'Issue:' : 'Activity:'}</span> {n.request}
                              </p>
                              {n.location && (
                                <p className="truncate text-gray-700">
                                  <span className="font-bold">Location:</span> {n.location}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-100">
                            <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                              <Clock3 size={12} /> {n.submittedAt || n.time}
                            </span>

                            {!isMaintenanceInfo && (
                              <button 
                                type="button" 
                                disabled={openingNotificationId === String(n.id || n.rawItem?.id || `${n.title}-${n.submittedAt}`)}
                                className={`text-xs py-1.5 px-3 font-bold rounded-xl transition-all ${
                                  isUnread ? 'bg-[#7A0808] text-white hover:bg-[#600000] shadow-xs' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewRequest(n);
                                }}
                              >
                                {n.notificationType === 'access_granted'
                                  ? 'Open Course Scheduling'
                                  : isMaintenanceReport && isGsd
                                    ? 'View Maintenance Report'
                                    : 'View Details'}
                              </button>
                            )}
                          </div>
                        </div>
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
              <p className="text-xs flex items-center gap-2" style={{ color: '#2B3235' }}><Mail size={14} className="text-[#7A0808]" /> {profileForm.email}</p>
              <p className="text-xs flex items-center gap-2" style={{ color: '#2B3235' }}><Phone size={14} className="text-[#7A0808]" /> {profileForm.phone}</p>
              <p className="text-xs flex items-center gap-2" style={{ color: '#2B3235' }}><BadgeCheck size={14} className="text-[#7A0808]" /> Account status: Verified</p>
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
              <User size={16} style={{ color: '#7A0808' }} />
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
              <Settings size={16} style={{ color: '#7A0808' }} />
              <h3 className="font-black text-sm" style={{ color: '#2B3235' }}>Settings</h3>
            </div>
            <div className="p-5 space-y-3">
              <button type="button" className="w-full text-left p-3 border border-gray-100 hover:bg-gray-50" style={{ borderRadius: r, color: '#2B3235' }}>
                <div className="flex items-center gap-2 font-bold text-sm"><FileText size={14} className="text-[#7A0808]" /> Preferences</div>
                <p className="text-xs mt-1 opacity-70">Configure notification and display options</p>
              </button>
              <button type="button" className="w-full text-left p-3 border border-gray-100 hover:bg-gray-50" style={{ borderRadius: r, color: '#2B3235' }}>
                <div className="flex items-center gap-2 font-bold text-sm"><Clock3 size={14} className="text-[#7A0808]" /> Session & Security</div>
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
                <div className="flex items-center gap-2 font-bold text-sm"><LockKeyhole size={14} className="text-[#7A0808]" /> Forgot Password</div>
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

      {notificationRedirect && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-live="polite">
          <div className="w-full max-w-sm rounded-2xl border border-[#D9A3A3] bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF0F0]">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-[#E7BABA] border-t-[#7A0808]" />
            </div>
            <h3 className="mt-4 text-lg font-black text-[#7A0808]">Redirecting…</h3>
            <p className="mt-1 text-sm font-bold text-gray-800">{notificationRedirect.title}</p>
            <p className="mt-1 text-xs text-gray-600">Opening {notificationRedirect.destination}. Please wait.</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
