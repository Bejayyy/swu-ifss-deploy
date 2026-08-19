import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Search, Send, MessageCircle, User, Check, CheckCheck, Clock, Shield,
  GraduationCap, Building2, Wrench, Users, BookOpen, ChevronDown, ChevronRight, Bookmark,
  Pencil, Trash2, Plus, Bell, Calendar as CalendarIcon, AlertCircle, CheckCircle2, X, CornerUpLeft, Pin,
  Share2, Tag, CheckSquare, ListTodo, ChevronLeft, LayoutGrid, StickyNote, Filter, Palette
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { subscribeStaffUsers } from '../services/systemUserService';
import {
  sendMessage,
  editMessage,
  editNoteDetails,
  deleteMessage,
  togglePinMessage,
  toggleCompleteMessage,
  subscribeConversationMessages,
  subscribeAllUserChats,
  markConversationAsRead,
  getCanonicalUserKey,
  extractAllKeys,
  getLocalReminders,
  saveReminder,
  updateReminder,
  toggleReminderCompleted,
  deleteReminder,
  clearConversationHistory,
  clearAllChatHistory,
} from '../services/chatService';
import DatePicker from '../components/ui/DatePicker';
import TimePicker from '../components/ui/TimePicker';
import CustomSelect from '../components/ui/CustomSelect';
import ConfirmModal from '../components/modals/ConfirmModal';

function formatMessageTime(ts) {
  if (!ts) return '';
  const date = typeof ts === 'number' ? new Date(ts) : ts.toDate ? ts.toDate() : new Date();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Clean Role Dropdown Options
const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Users' },
  { value: 'self', label: 'My Notes & Reminders' },
  { value: 'registrar', label: 'Registrar Office' },
  { value: 'dean', label: 'Deans & Academic' },
  { value: 'teacher', label: 'Teachers & Faculty' },
  { value: 'gsd', label: 'GSD & Maintenance' },
  { value: 'student_life', label: 'Student Life & Orgs' },
];

const PRIORITY_OPTIONS = [
  { value: 'High', label: '🔴 High Priority' },
  { value: 'Medium', label: '🟡 Medium Priority' },
  { value: 'Normal', label: '🔵 Normal Priority' },
];

// Rich Color Palette: Soft Cute Pastels to Bold Hard Colors
const STICKY_COLORS = {
  amber: { label: 'Sunshine Yellow', bg: 'bg-[#FEF08A]', border: 'border-[#FDE047]', text: 'text-[#713F12]', badge: 'bg-[#FDE047] text-[#713F12]', dot: 'bg-[#FDE047]' },
  emerald: { label: 'Soft Mint Green', bg: 'bg-[#A7F3D0]', border: 'border-[#6EE7B7]', text: 'text-[#064E3B]', badge: 'bg-[#6EE7B7] text-[#064E3B]', dot: 'bg-[#6EE7B7]' },
  sky: { label: 'Pastel Sky Blue', bg: 'bg-[#BAE6FD]', border: 'border-[#7DD3FC]', text: 'text-[#0C4A6E]', badge: 'bg-[#7DD3FC] text-[#0C4A6E]', dot: 'bg-[#7DD3FC]' },
  rose: { label: 'Cute Blossom Pink', bg: 'bg-[#FBCFE8]', border: 'border-[#F9A8D4]', text: 'text-[#831843]', badge: 'bg-[#F9A8D4] text-[#831843]', dot: 'bg-[#F9A8D4]' },
  purple: { label: 'Lavender Purple', bg: 'bg-[#DDD6FE]', border: 'border-[#C4B5FD]', text: 'text-[#4C1D95]', badge: 'bg-[#C4B5FD] text-[#4C1D95]', dot: 'bg-[#C4B5FD]' },
  orange: { label: 'Sunset Peach', bg: 'bg-[#FFEDD5]', border: 'border-[#FDBA74]', text: 'text-[#7C2D12]', badge: 'bg-[#FDBA74] text-[#7C2D12]', dot: 'bg-[#FDBA74]' },
  red: { label: 'Bold Coral Red', bg: 'bg-[#F87171]', border: 'border-[#EF4444]', text: 'text-white', badge: 'bg-white/25 text-white', dot: 'bg-[#EF4444]' },
  maroon: { label: 'SWU Maroon', bg: 'bg-[#7A0808]', border: 'border-[#900A0A]', text: 'text-white', badge: 'bg-white/25 text-white', dot: 'bg-[#7A0808]' },
};

export default function Messages() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const currentUid = profile?.uid || profile?.id || user?.uid;

  const currentUserObj = useMemo(
    () => ({
      uid: currentUid,
      id: currentUid,
      email: profile?.email || user?.email || '',
      name: profile?.displayName || user?.displayName || profile?.name || 'User',
    }),
    [currentUid, profile, user]
  );

  const [usersList, setUsersList] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [allUserChats, setAllUserChats] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // Self Workspace View Mode: 'calendar' | 'sticky' | 'reminders'
  const [workspaceViewMode, setWorkspaceViewMode] = useState('calendar');

  // Calendar State
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(new Date().toISOString().split('T')[0]);
  const [showDayDetailsModal, setShowDayDetailsModal] = useState(false); // Pop-up modal when date clicked

  // Avatar Bar Mouse Drag & Scroll State
  const avatarScrollRef = useRef(null);
  const [isDraggingAvatars, setIsDraggingAvatars] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Message reply state
  const [replyToMsg, setReplyToMsg] = useState(null);

  // Edit message / Note state
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editInputText, setEditInputText] = useState('');

  // New Sticky Note Modal State
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteDate, setNewNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [newNoteColor, setNewNoteColor] = useState('amber');

  // Forward Note Modal state
  const [forwardingNote, setForwardingNote] = useState(null);
  const [forwardTargetUser, setForwardTargetUser] = useState(null);

  // Reminders state
  const [reminders, setReminders] = useState([]);
  const [showAddReminderModal, setShowAddReminderModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [remTitle, setRemTitle] = useState('');
  const [remDate, setRemDate] = useState('');
  const [remTime, setRemTime] = useState('09:00');
  const [remPriority, setRemPriority] = useState('Medium');

  // Confirmation Modal state
  const [confirmModalConfig, setConfirmModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    variant: 'danger',
    onConfirm: null,
  });

  const messagesEndRef = useRef(null);

  // Avatar Bar Drag handlers
  const handleAvatarMouseDown = (e) => {
    if (!avatarScrollRef.current) return;
    setIsDraggingAvatars(true);
    setStartX(e.pageX - avatarScrollRef.current.offsetLeft);
    setScrollLeft(avatarScrollRef.current.scrollLeft);
  };

  const handleAvatarMouseLeave = () => {
    setIsDraggingAvatars(false);
  };

  const handleAvatarMouseUp = () => {
    setIsDraggingAvatars(false);
  };

  const handleAvatarMouseMove = (e) => {
    if (!isDraggingAvatars || !avatarScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - avatarScrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    avatarScrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleAvatarWheel = (e) => {
    if (!avatarScrollRef.current) return;
    if (e.deltaY !== 0) {
      avatarScrollRef.current.scrollLeft += e.deltaY;
    }
  };

  // Load reminders
  const refreshReminders = () => {
    const uKey = getCanonicalUserKey(currentUserObj);
    if (uKey) {
      setReminders(getLocalReminders(uKey));
    }
  };

  useEffect(() => {
    refreshReminders();
    const handleRemUpdate = () => refreshReminders();
    window.addEventListener('swu_reminders_updated', handleRemUpdate);
    return () => window.removeEventListener('swu_reminders_updated', handleRemUpdate);
  }, [currentUserObj]);

  // Subscribe ONLY to registered system users added in database & inject Self user
  useEffect(() => {
    const unsub = subscribeStaffUsers(
      (users) => {
        const cKey = getCanonicalUserKey(currentUserObj);

        // 1. Self Chat / Personal Notes Entry
        const selfUser = {
          uid: currentUid || 'self_user',
          id: currentUid || 'self_user',
          email: profile?.email || user?.email || '',
          name: `${profile?.displayName || user?.displayName || profile?.name || 'You'} (Notes & Reminders)`,
          role: 'You',
          roleValue: 'self',
          department: 'Personal Dashboard',
          initials: 'YOU',
          isSelf: true,
          isOnline: true,
        };

        // 2. Filter ONLY registered active system users from database
        const registeredSystemUsers = (users || []).filter((u) => {
          const uKey = getCanonicalUserKey(u);
          return uKey && uKey !== cKey && u.email && u.status !== 'migrated' && u.roleValue !== 'developer';
        });

        const mergedList = [selfUser, ...registeredSystemUsers];
        setUsersList(mergedList);

        if (location.state?.preselectUid) {
          const preKey = String(location.state.preselectUid).toLowerCase();
          const pre = mergedList.find(
            (u) =>
              getCanonicalUserKey(u) === preKey ||
              String(u.uid || u.id).toLowerCase() === preKey ||
              String(u.email || '').toLowerCase() === preKey
          );
          if (pre) setSelectedUser(pre);
        }
      },
      (err) => console.warn('Error fetching system users:', err)
    );

    return () => unsub();
  }, [currentUid, currentUserObj, profile, user, location.state]);

  // Subscribe to all user chats for real-time previews & unread counters
  useEffect(() => {
    const unsub = subscribeAllUserChats(currentUserObj, (chats) => {
      setAllUserChats(chats || []);
    });
    return () => unsub();
  }, [currentUserObj]);

  // Subscribe to active conversation messages & mark as read
  useEffect(() => {
    if (!selectedUser) {
      setMessages([]);
      return;
    }

    setReplyToMsg(null);
    markConversationAsRead(currentUserObj, selectedUser);

    const unsub = subscribeConversationMessages(currentUserObj, selectedUser, (msgs) => {
      setMessages(msgs || []);
    });

    return () => unsub();
  }, [currentUserObj, selectedUser]);

  // Auto-scroll chat window to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Map latest message and unread count per user with multi-key evaluation
  const userChatMeta = useMemo(() => {
    const map = {};
    const cKeys = extractAllKeys(currentUserObj);

    (allUserChats || []).forEach((msg) => {
      const sKeys = extractAllKeys({
        email: msg.senderEmail,
        uid: msg.senderUid,
        id: msg.senderKey,
        key: msg.senderKey,
        name: msg.senderName,
      });

      const rKeys = extractAllKeys({
        email: msg.receiverEmail,
        uid: msg.receiverUid,
        id: msg.receiverKey,
        key: msg.receiverKey,
      });

      const isSender = sKeys.some((sk) => cKeys.includes(sk));
      const otherKeys = isSender ? rKeys : sKeys;
      const isReceiver = rKeys.some((rk) => cKeys.includes(rk));

      otherKeys.forEach((oKey) => {
        if (!map[oKey]) {
          map[oKey] = { latestMsg: msg, unreadCount: 0 };
        }
        if ((msg.timestamp || 0) >= (map[oKey].latestMsg?.timestamp || 0)) {
          map[oKey].latestMsg = msg;
        }
        if (isReceiver && !msg.read) {
          map[oKey].unreadCount += 1;
        }
      });
    });
    return map;
  }, [allUserChats, currentUserObj]);

  const getUserMeta = (u) => {
    if (!u) return { latestMsg: null, unreadCount: 0 };
    const keys = extractAllKeys(u);
    let latestMsg = null;
    let unreadCount = 0;
    keys.forEach((k) => {
      const meta = userChatMeta[k];
      if (meta) {
        if (!latestMsg || (meta.latestMsg?.timestamp || 0) > (latestMsg.timestamp || 0)) {
          latestMsg = meta.latestMsg;
        }
        if (meta.unreadCount > unreadCount) {
          unreadCount = meta.unreadCount;
        }
      }
    });
    return { latestMsg, unreadCount };
  };

  const isUserOnline = (u) => {
    if (!u) return false;
    if (u.isSelf) return true;
    if (u.isOnline) return true;
    const meta = getUserMeta(u);
    return Boolean(meta.latestMsg?.timestamp && (Date.now() - meta.latestMsg.timestamp) < 15 * 60 * 1000);
  };

  // Personal Workspace Stats
  const personalStats = useMemo(() => {
    const pendingCount = reminders.filter((r) => !r.completed).length;
    const completedCount = reminders.filter((r) => r.completed).length;
    const pinnedCount = messages.filter((m) => m.pinned).length;
    return {
      totalReminders: reminders.length,
      pendingCount,
      completedCount,
      pinnedCount,
      totalNotes: messages.length,
    };
  }, [reminders, messages]);

  // Clean Flat List of Users
  const filteredAndSortedUsers = useMemo(() => {
    const cKeys = extractAllKeys(currentUserObj);
    const selKeys = selectedUser ? extractAllKeys(selectedUser) : [];

    return usersList
      .filter((u) => {
        const uKeys = extractAllKeys(u);
        const meta = getUserMeta(u);

        if (u.isSelf) return true;

        const isSearching = searchQuery.trim().length > 0;
        const matchesSearch =
          isSearching &&
          (u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.department?.toLowerCase().includes(searchQuery.toLowerCase()));

        const hasChatHistory = Boolean(meta.latestMsg);
        const isCurrentlySelected = selectedUser && uKeys.some((k) => selKeys.includes(k));

        if (isSearching) {
          if (!matchesSearch) return false;
        } else {
          if (!hasChatHistory && !isCurrentlySelected) {
            return false;
          }
        }

        if (activeTab === 'unread' && !(meta.unreadCount > 0)) return false;

        const rVal = (u.roleValue || u.role || '').toLowerCase();
        if (activeTab !== 'all' && activeTab !== 'unread') {
          if (activeTab === 'self' && !u.isSelf) return false;
          if (activeTab === 'registrar' && rVal !== 'registrar') return false;
          if (activeTab === 'dean' && rVal !== 'dean') return false;
          if (activeTab === 'teacher' && rVal !== 'teacher') return false;
          if (activeTab === 'gsd' && rVal !== 'gsd') return false;
          if (activeTab === 'student_life' && !['student_life', 'organization_head'].includes(rVal)) return false;
          if (activeTab === 'property_office' && !['property_office', 'vp_academics', 'chancellor'].includes(rVal)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.isSelf) return -1;
        if (b.isSelf) return 1;

        const metaA = getUserMeta(a);
        const metaB = getUserMeta(b);
        const timeA = metaA.latestMsg?.timestamp || 0;
        const timeB = metaB.latestMsg?.timestamp || 0;

        if (timeA !== timeB) return timeB - timeA;
        return a.name.localeCompare(b.name);
      });
  }, [usersList, searchQuery, activeTab, userChatMeta, selectedUser, currentUserObj]);

  // Calendar Days Calculation
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const daysArr = [];

    // Previous month padding days
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      daysArr.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        dateStr: '',
      });
    }

    // Current month days
    const todayStr = new Date().toISOString().split('T')[0];
    for (let d = 1; d <= daysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(d).padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${dayStr}`;

      const notesOnDate = messages.filter((m) => {
        const dStr = m.noteDate || new Date(m.timestamp).toISOString().split('T')[0];
        return dStr === dateStr;
      });

      const remindersOnDate = reminders.filter((r) => r.date === dateStr);

      daysArr.push({
        day: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        dateStr,
        notes: notesOnDate,
        reminders: remindersOnDate,
      });
    }

    return daysArr;
  }, [calendarDate, messages, reminders]);

  // Items for selected calendar day
  const selectedDayItems = useMemo(() => {
    if (!selectedCalendarDay) return { notes: [], reminders: [] };
    const notes = messages.filter((m) => {
      const dStr = m.noteDate || new Date(m.timestamp).toISOString().split('T')[0];
      return dStr === selectedCalendarDay;
    });
    const rems = reminders.filter((r) => r.date === selectedCalendarDay);
    return { notes, reminders: rems };
  }, [selectedCalendarDay, messages, reminders]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedUser || isSending) return;

    const textToSend = inputText;
    const currentReply = replyToMsg;

    setInputText('');
    setReplyToMsg(null);
    setIsSending(true);

    try {
      await sendMessage({
        sender: currentUserObj,
        receiver: selectedUser,
        senderName: profile?.displayName || user?.displayName || profile?.name || 'User',
        text: textToSend,
        replyTo: currentReply,
        noteDate: selectedUser.isSelf ? selectedCalendarDay : undefined,
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateStickyNoteSubmit = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    try {
      await sendMessage({
        sender: currentUserObj,
        receiver: selectedUser,
        senderName: profile?.displayName || user?.displayName || profile?.name || 'User',
        text: newNoteText,
        noteDate: newNoteDate,
        colorTheme: newNoteColor,
      });
      setNewNoteText('');
      setShowAddNoteModal(false);
    } catch (err) {
      console.error('Error creating sticky note:', err);
    }
  };

  const handleChangeNoteColor = async (m, colorKey) => {
    try {
      await editNoteDetails({
        user1: currentUserObj,
        user2: selectedUser,
        messageId: m.id,
        colorTheme: colorKey,
      });
    } catch (err) {
      console.error('Error changing note color:', err);
    }
  };

  const handleTogglePinNote = async (m) => {
    try {
      await togglePinMessage({
        user1: currentUserObj,
        user2: selectedUser,
        messageId: m.id,
      });
    } catch (err) {
      console.error('Error toggling pin:', err);
    }
  };

  const handleToggleCompleteNote = async (m) => {
    try {
      await toggleCompleteMessage({
        user1: currentUserObj,
        user2: selectedUser,
        messageId: m.id,
      });
    } catch (err) {
      console.error('Error toggling note complete:', err);
    }
  };

  const handleForwardNote = async () => {
    if (!forwardingNote || !forwardTargetUser) return;
    try {
      await sendMessage({
        sender: currentUserObj,
        receiver: forwardTargetUser,
        senderName: profile?.displayName || user?.displayName || profile?.name || 'User',
        text: `[Forwarded Sticky Note]: ${forwardingNote.text}`,
      });
      setForwardingNote(null);
      setForwardTargetUser(null);
    } catch (err) {
      console.error('Error forwarding note:', err);
    }
  };

  const handleStartReply = (m) => {
    const sKey = String(m.senderKey || m.senderEmail || m.senderUid || '').toLowerCase();
    const isMe = sKey === getCanonicalUserKey(currentUserObj);
    setReplyToMsg({
      id: m.id,
      text: m.text,
      senderName: isMe ? 'You' : (m.senderName || selectedUser.name),
    });
  };

  const handleStartEdit = (m) => {
    setEditingMsgId(m.id);
    setEditInputText(m.text);
  };

  const handleSaveEdit = async (m) => {
    if (!editInputText.trim()) return;
    try {
      await editMessage({
        user1: currentUserObj,
        user2: selectedUser,
        messageId: m.id,
        newText: editInputText,
      });
      setEditingMsgId(null);
    } catch (err) {
      console.error('Error editing message:', err);
    }
  };

  // Open Edit Reminder Modal
  const handleOpenEditReminder = (rem) => {
    setEditingReminder(rem);
    setRemTitle(rem.title);
    setRemDate(rem.date || '');
    setRemTime(rem.time || '09:00');
    setRemPriority(rem.priority || 'Medium');
  };

  // Open system ConfirmModal for deleting a message
  const handleDeleteMsgClick = (m) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Delete Sticky Note',
      message: 'Are you sure you want to delete this sticky note? This action cannot be undone.',
      confirmText: 'Delete Note',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteMessage({
            user1: currentUserObj,
            user2: selectedUser,
            messageId: m.id,
          });
        } catch (err) {
          console.error('Error deleting message:', err);
        } finally {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Open system ConfirmModal for clearing active conversation history
  const handleClearChatClick = () => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Clear Chat Data',
      message: `Are you sure you want to clear all chat messages with ${selectedUser.name}? This will erase messages from both local storage and database.`,
      confirmText: 'Clear Chat Data',
      variant: 'danger',
      onConfirm: async () => {
        setMessages([]);
        try {
          await clearConversationHistory(currentUserObj, selectedUser);
        } catch (e) {
          console.error('Error clearing conversation:', e);
        } finally {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Open system ConfirmModal for deleting a reminder
  const handleDeleteReminderClick = (remId) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Delete Reminder',
      message: 'Are you sure you want to delete this personal reminder?',
      confirmText: 'Delete Reminder',
      variant: 'danger',
      onConfirm: () => {
        deleteReminder(remId);
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleSaveReminderSubmit = (e) => {
    e.preventDefault();
    const uKey = getCanonicalUserKey(currentUserObj);
    if (!remTitle.trim() || !uKey) return;

    if (editingReminder) {
      updateReminder(editingReminder.id, {
        title: remTitle,
        date: remDate,
        time: remTime,
        priority: remPriority,
      });
      setEditingReminder(null);
    } else {
      saveReminder(uKey, {
        title: remTitle,
        date: remDate,
        time: remTime,
        priority: remPriority,
      });
    }

    setRemTitle('');
    setRemDate('');
    setRemTime('09:00');
    setRemPriority('Medium');
    setShowAddReminderModal(false);
  };

  const setQuickPreset = (presetType) => {
    const today = new Date();
    if (presetType === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setRemDate(tomorrow.toISOString().split('T')[0]);
      setRemTime('09:00');
    } else if (presetType === 'next_monday') {
      const monday = new Date(today);
      monday.setDate(monday.getDate() + ((1 + 7 - monday.getDay()) % 7 || 7));
      setRemDate(monday.toISOString().split('T')[0]);
      setRemTime('09:00');
    } else if (presetType === 'today_evening') {
      setRemDate(today.toISOString().split('T')[0]);
      setRemTime('17:00');
    }
  };

  const renderUserRow = (u) => {
    const uKey = getCanonicalUserKey(u);
    const selectedKeys = selectedUser ? extractAllKeys(selectedUser) : [];
    const isSelected = selectedUser && extractAllKeys(u).some((k) => selectedKeys.includes(k));
    const meta = getUserMeta(u);
    const hasUnread = meta.unreadCount > 0;
    const isOnline = isUserOnline(u);

    return (
      <button
        key={uKey}
        type="button"
        onClick={() => setSelectedUser(u)}
        className={`w-full text-left p-3 flex items-center gap-3 transition-all rounded-2xl cursor-pointer ${
          isSelected
            ? 'bg-[#7A0808] text-white shadow-xs'
            : 'hover:bg-gray-100/80 text-[#2B3235] bg-white border border-gray-100'
        }`}
      >
        <div className="relative flex-shrink-0">
          <div
            className={`w-9 h-9 rounded-full font-black text-xs flex items-center justify-center shadow-2xs uppercase ${
              isSelected
                ? 'bg-white text-[#7A0808]'
                : u.isSelf
                ? 'bg-emerald-600 text-white'
                : 'bg-[#7A0808] text-white'
            }`}
          >
            {u.initials || u.name?.substring(0, 2) || 'U'}
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white inline-block ${
              isOnline ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-[#2B3235]'}`}>
              {u.name}
            </p>
            {meta.latestMsg?.timestamp && (
              <span className={`text-[10px] flex-shrink-0 ${isSelected ? 'text-red-100' : 'text-gray-400'}`}>
                {formatMessageTime(meta.latestMsg.timestamp)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md leading-none ${
                isSelected
                  ? 'bg-white/20 text-white'
                  : u.isSelf
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-gray-100 text-gray-700 border border-gray-200/80'
              }`}
            >
              {u.role}
            </span>
            {u.department && (
              <span className={`text-[10px] truncate ${isSelected ? 'text-red-100' : 'text-gray-400'}`}>
                · {u.department}
              </span>
            )}
          </div>

          {meta.latestMsg ? (
            <p className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-red-100' : hasUnread ? 'font-bold text-[#2B3235]' : 'text-gray-500'}`}>
              {String(meta.latestMsg.senderKey || '').toLowerCase() === getCanonicalUserKey(currentUserObj) ? 'You: ' : ''}
              {meta.latestMsg.text}
            </p>
          ) : (
            <p className={`text-[10px] italic mt-0.5 ${isSelected ? 'text-red-200' : 'text-gray-400'}`}>
              {u.isSelf ? 'Calendar, Sticky Notes & Reminders' : 'Click to start conversation'}
            </p>
          )}
        </div>

        {hasUnread && !isSelected && (
          <span className="w-5 h-5 rounded-full bg-[#F59E0B] text-white text-[10px] font-black flex items-center justify-center shadow-2xs flex-shrink-0">
            {meta.unreadCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <Layout
      title="Messages & User Coordination"
      subtitle="Direct real-time messaging with Deans, Registrar, GSD, and Department Heads"
    >
      <div className="flex flex-col lg:flex-row gap-5 h-[calc(100vh-170px)] min-h-[580px] max-h-[720px] w-full">
        {/* Left Directory Card */}
        <div className="w-full lg:w-96 bg-white rounded-3xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-gray-200 bg-white space-y-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-sm text-[#2B3235] flex items-center gap-2">
                <MessageCircle size={16} className="text-[#7A0808]" /> System Directory
              </h2>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-50 text-[#7A0808] border border-red-100">
                {usersList.length} System Users
              </span>
            </div>

            {/* Quick Profile Avatars Bar */}
            <div
              ref={avatarScrollRef}
              onMouseDown={handleAvatarMouseDown}
              onMouseLeave={handleAvatarMouseLeave}
              onMouseUp={handleAvatarMouseUp}
              onMouseMove={handleAvatarMouseMove}
              onWheel={handleAvatarWheel}
              className="flex items-center gap-5 overflow-x-auto py-2.5 px-2 cursor-grab active:cursor-grabbing border-b border-gray-100 mb-2 select-none scroll-smooth"
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: '#7A0808 #F3F4F6',
              }}
            >
              {usersList.map((u) => {
                const uKey = getCanonicalUserKey(u);
                const selectedKeys = selectedUser ? extractAllKeys(selectedUser) : [];
                const isSelected = selectedUser && extractAllKeys(u).some((k) => selectedKeys.includes(k));
                const isOnline = isUserOnline(u);

                return (
                  <button
                    key={`avatar_${uKey}`}
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className="flex flex-col items-center flex-shrink-0 group cursor-pointer transition-transform active:scale-95 py-1 px-1"
                    title={`${u.name} (${u.role})`}
                  >
                    <div className="relative">
                      <div
                        className={`w-11 h-11 rounded-full font-black text-xs flex items-center justify-center transition-all ${
                          isSelected
                            ? 'ring-3 ring-[#7A0808] scale-105 shadow-md'
                            : 'group-hover:scale-105 shadow-2xs'
                        } ${
                          u.isSelf ? 'bg-emerald-600 text-white' : 'bg-[#7A0808] text-white'
                        }`}
                      >
                        {u.initials || u.name?.substring(0, 2) || 'U'}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white inline-block ${
                          isOnline ? 'bg-emerald-500' : 'bg-gray-300'
                        }`}
                      />
                    </div>
                    <span className={`text-[10px] font-bold mt-1.5 truncate max-w-[56px] ${isSelected ? 'text-[#7A0808]' : 'text-gray-600'}`}>
                      {u.isSelf ? 'You' : u.name?.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, role, department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#7A0808] focus:outline-none transition-all font-medium"
              />
            </div>

            {/* Clean Role Dropdown Filter & Unread Toggle */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CustomSelect
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value)}
                  options={ROLE_FILTER_OPTIONS}
                />
              </div>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'unread' ? 'all' : 'unread')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 border ${
                  activeTab === 'unread'
                    ? 'bg-[#7A0808] text-white border-[#7A0808] shadow-2xs'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <span>Unread</span>
              </button>
            </div>
          </div>

          {/* User Directory List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-gray-50/50">
            {filteredAndSortedUsers.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs font-semibold">
                No matching active chats found.
              </div>
            ) : filteredAndSortedUsers.length === 1 && filteredAndSortedUsers[0].isSelf && !searchQuery ? (
              <>
                {renderUserRow(filteredAndSortedUsers[0])}
                <div className="p-6 text-center text-gray-400 text-xs bg-white rounded-2xl border border-gray-200/80 my-2 shadow-2xs">
                  <p className="font-bold text-[#2B3235] mb-1">No active conversations yet</p>
                  <p className="text-[11px] text-gray-500">
                    Click a profile avatar above or search a user to start chatting!
                  </p>
                </div>
              </>
            ) : (
              filteredAndSortedUsers.map((u) => renderUserRow(u))
            )}
          </div>
        </div>

        {/* Right Chat & Reminders Window Card */}
        <div className="flex-1 bg-white rounded-3xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden">
          {selectedUser ? (
            <>
              {/* Active User Header */}
              <div className="px-6 py-3 border-b border-gray-200 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 bg-white shadow-2xs flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative flex-shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full font-black text-xs flex items-center justify-center shadow-2xs uppercase ${
                        selectedUser.isSelf ? 'bg-emerald-600 text-white' : 'bg-[#7A0808] text-white'
                      }`}
                    >
                      {selectedUser.initials || selectedUser.name?.substring(0, 2) || 'U'}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white inline-block ${
                        isUserOnline(selectedUser)
                          ? 'bg-emerald-500'
                          : 'bg-gray-300'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm text-[#2B3235] truncate">{selectedUser.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md bg-red-50 text-[#7A0808] border border-red-100 flex-shrink-0">
                        {selectedUser.role}
                      </span>
                      {isUserOnline(selectedUser) ? (
                        <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" /> Active Online
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" /> Offline
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedUser.isSelf ? (
                    <>
                      {/* 1. Primary Action: Add Reminder */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReminder(null);
                          setRemTitle('');
                          setRemDate(selectedCalendarDay || new Date().toISOString().split('T')[0]);
                          setRemTime('09:00');
                          setRemPriority('Medium');
                          setShowAddReminderModal(true);
                        }}
                        className="btn-maroon h-9 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap transition-all"
                      >
                        <Plus size={14} /> Reminder
                      </button>

                      {/* 2. Secondary Action: Sticky Note */}
                      <button
                        type="button"
                        onClick={() => {
                          setNewNoteText('');
                          setNewNoteDate(selectedCalendarDay || new Date().toISOString().split('T')[0]);
                          setShowAddNoteModal(true);
                        }}
                        className="h-9 px-3.5 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100/90 rounded-xl border border-amber-300/80 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
                      >
                        <StickyNote size={14} className="text-amber-600" /> Sticky Note
                      </button>

                      {/* 3. Destructive Action: Clear Data (Last) */}
                      <button
                        type="button"
                        onClick={handleClearChatClick}
                        className="btn-delete h-9 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap transition-all"
                        title="Clear workspace scratch history"
                      >
                        <Trash2 size={14} /> Clear Data
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleClearChatClick}
                      className="btn-delete h-9 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap transition-all"
                      title="Clear chat history for this user"
                    >
                      <Trash2 size={14} /> Clear Data
                    </button>
                  )}
                </div>
              </div>

              {/* Self Chat: Personal Workspace */}
              {selectedUser.isSelf ? (
                <div className="flex-1 p-5 overflow-y-auto space-y-5 bg-gray-50/40">
                  {/* View Mode Switcher */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-gray-200 shadow-2xs">
                    <div className="flex items-center gap-1.5 bg-gray-100/80 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setWorkspaceViewMode('calendar')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          workspaceViewMode === 'calendar'
                            ? 'bg-[#7A0808] text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <CalendarIcon size={14} /> Calendar View
                      </button>
                      <button
                        type="button"
                        onClick={() => setWorkspaceViewMode('sticky')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          workspaceViewMode === 'sticky'
                            ? 'bg-[#7A0808] text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <StickyNote size={14} /> Sticky Board ({personalStats.totalNotes})
                      </button>
                      <button
                        type="button"
                        onClick={() => setWorkspaceViewMode('reminders')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          workspaceViewMode === 'reminders'
                            ? 'bg-[#7A0808] text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        <Bell size={14} /> Reminders ({personalStats.pendingCount})
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                        <CheckSquare size={12} /> {personalStats.completedCount} Completed
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-100 flex items-center gap-1">
                        <Pin size={12} /> {personalStats.pinnedCount} Pinned
                      </span>
                    </div>
                  </div>

                  {/* 1. CALENDAR VIEW MODE */}
                  {workspaceViewMode === 'calendar' && (
                    <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-2xs space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-sm text-[#2B3235] flex items-center gap-2">
                          <CalendarIcon size={18} className="text-[#7A0808]" />
                          {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h4>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newD = new Date(calendarDate);
                              newD.setMonth(newD.getMonth() - 1);
                              setCalendarDate(newD);
                            }}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-xl cursor-pointer border border-gray-200"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCalendarDate(new Date());
                              setSelectedCalendarDay(new Date().toISOString().split('T')[0]);
                            }}
                            className="px-3 py-1 text-xs font-bold text-[#7A0808] bg-red-50 hover:bg-red-100 rounded-xl border border-red-100 cursor-pointer"
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newD = new Date(calendarDate);
                              newD.setMonth(newD.getMonth() + 1);
                              setCalendarDate(newD);
                            }}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-xl cursor-pointer border border-gray-200"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Calendar Days Header */}
                      <div className="grid grid-cols-7 gap-1 text-center font-bold text-[11px] text-gray-400 uppercase tracking-wider">
                        <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                      </div>

                      {/* Calendar Month Grid */}
                      <div className="grid grid-cols-7 gap-1.5">
                        {calendarDays.map((cd, idx) => {
                          if (!cd.isCurrentMonth) {
                            return <div key={`empty_${idx}`} className="h-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-100 opacity-40" />;
                          }

                          const isSelected = selectedCalendarDay === cd.dateStr;

                          return (
                            <button
                              key={cd.dateStr}
                              type="button"
                              onClick={() => {
                                setSelectedCalendarDay(cd.dateStr);
                                setShowDayDetailsModal(true); // POP UP MODAL DIRECTLY ON CLICK!
                              }}
                              className={`h-16 p-1.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${
                                isSelected
                                  ? 'bg-red-50/90 border-[#7A0808] ring-2 ring-[#7A0808]'
                                  : cd.isToday
                                  ? 'bg-amber-50/80 border-amber-300'
                                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-2xs'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-xs font-black w-5 h-5 rounded-full flex items-center justify-center ${
                                    cd.isToday
                                      ? 'bg-[#7A0808] text-white'
                                      : isSelected
                                      ? 'bg-red-200 text-[#7A0808]'
                                      : 'text-gray-700'
                                  }`}
                                >
                                  {cd.day}
                                </span>

                                <div className="flex items-center gap-0.5">
                                  {cd.notes.length > 0 && (
                                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" title={`${cd.notes.length} notes`} />
                                  )}
                                  {cd.reminders.length > 0 && (
                                    <span className="w-2 h-2 rounded-full bg-red-600 inline-block" title={`${cd.reminders.length} reminders`} />
                                  )}
                                </div>
                              </div>

                              <div className="space-y-0.5">
                                {cd.notes.slice(0, 1).map((n) => (
                                  <div
                                    key={n.id}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200/90 text-amber-900 truncate leading-none"
                                  >
                                    📌 {n.text}
                                  </div>
                                ))}
                                {cd.reminders.slice(0, 1).map((r) => (
                                  <div
                                    key={r.id}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-900 truncate leading-none"
                                  >
                                    🔔 {r.title}
                                  </div>
                                ))}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. STICKY NOTES BOARD MODE */}
                  {workspaceViewMode === 'sticky' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-xs text-[#2B3235] uppercase tracking-wider flex items-center gap-2">
                          <StickyNote size={16} className="text-amber-600" /> Digital Sticky Notes Board ({messages.length})
                        </h4>
                        <button
                          type="button"
                          onClick={() => {
                            setNewNoteText('');
                            setNewNoteDate(selectedCalendarDay || new Date().toISOString().split('T')[0]);
                            setShowAddNoteModal(true);
                          }}
                          className="px-3 py-1.5 rounded-xl font-bold text-xs text-amber-900 bg-amber-200 hover:bg-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Plus size={14} /> New Sticky Note
                        </button>
                      </div>

                      {messages.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-xs bg-white rounded-3xl border border-gray-200">
                          No sticky notes created yet. Click <strong>New Sticky Note</strong> to post quick codes or scratch notes!
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                          {messages.map((m) => {
                            const st = STICKY_COLORS[m.colorTheme || 'amber'] || STICKY_COLORS.amber;
                            return (
                              <div
                                key={m.id}
                                className={`p-4 rounded-3xl border ${st.bg} ${st.border} ${st.text} shadow-sm space-y-3 relative group transform hover:-translate-y-1 transition-all ${
                                  m.pinned ? 'ring-3 ring-amber-400' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between border-b border-black/10 pb-2">
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${st.badge}`}>
                                    📅 {m.noteDate || formatMessageTime(m.timestamp)}
                                  </span>

                                  {/* Color Theme Selector Palette (8 Rich Cute Soft-to-Bold Colors) */}
                                  <div className="flex items-center gap-1">
                                    {Object.keys(STICKY_COLORS).map((cKey) => {
                                      const cItem = STICKY_COLORS[cKey];
                                      return (
                                        <button
                                          key={cKey}
                                          type="button"
                                          onClick={() => handleChangeNoteColor(m, cKey)}
                                          className={`w-3.5 h-3.5 rounded-full border border-black/20 cursor-pointer ${cItem.dot}`}
                                          title={`Change color to ${cItem.label}`}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>

                                {editingMsgId === m.id ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={editInputText}
                                      onChange={(e) => setEditInputText(e.target.value)}
                                      className="w-full p-2 text-xs bg-white text-[#2B3235] rounded-xl border focus:outline-none font-medium"
                                      rows={3}
                                    />
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingMsgId(null)}
                                        className="px-2 py-1 text-[10px] font-bold bg-black/10 rounded-lg"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSaveEdit(m)}
                                        className="px-2 py-1 text-[10px] font-bold bg-[#7A0808] text-white rounded-lg"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className={`text-xs font-bold leading-relaxed whitespace-pre-wrap break-words ${m.completed ? 'line-through opacity-70' : ''}`}>
                                    {m.text}
                                  </p>
                                )}

                                <div className="flex items-center justify-between border-t border-black/10 pt-2 text-[10px]">
                                  <span className="font-semibold opacity-75">{formatMessageTime(m.timestamp)}</span>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCompleteNote(m)}
                                      className="p-1 hover:opacity-75 cursor-pointer"
                                      title={m.completed ? 'Mark incomplete' : 'Mark done'}
                                    >
                                      <CheckCircle2 size={14} className={m.completed ? 'fill-emerald-600 text-white' : ''} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePinNote(m)}
                                      className="p-1 hover:opacity-75 cursor-pointer"
                                      title={m.pinned ? 'Unpin' : 'Pin to top'}
                                    >
                                      <Pin size={14} className={m.pinned ? 'fill-amber-500' : ''} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setForwardingNote(m)}
                                      className="p-1 hover:opacity-75 cursor-pointer"
                                      title="Forward note"
                                    >
                                      <Share2 size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(m)}
                                      className="p-1 hover:opacity-75 cursor-pointer"
                                      title="Edit note"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteMsgClick(m)}
                                      className="p-1 hover:opacity-75 cursor-pointer text-red-700"
                                      title="Delete note"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. REMINDERS LIST MODE */}
                  {workspaceViewMode === 'reminders' && (
                    <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-2xs space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-extrabold text-xs text-[#2B3235] uppercase tracking-wider flex items-center gap-2">
                          <Bell size={16} className="text-[#7A0808]" /> Personal Reminders Tracker ({reminders.length})
                        </h4>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingReminder(null);
                            setRemTitle('');
                            setRemDate(selectedCalendarDay || new Date().toISOString().split('T')[0]);
                            setRemTime('09:00');
                            setRemPriority('Medium');
                            setShowAddReminderModal(true);
                          }}
                          className="btn-maroon px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Plus size={14} /> New Reminder
                        </button>
                      </div>

                      {reminders.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-xs bg-gray-50/80 rounded-2xl border border-dashed border-gray-200">
                          No active reminders set. Click <strong>New Reminder</strong> to create facility tasks or schedule alerts!
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {reminders.map((rem) => (
                            <div
                              key={rem.id}
                              className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all shadow-2xs ${
                                rem.completed
                                  ? 'bg-gray-50 border-gray-200 opacity-60 line-through'
                                  : 'bg-white border-gray-200 hover:border-[#7A0808]'
                              }`}
                            >
                              <div className="flex items-center gap-3.5 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => toggleReminderCompleted(rem.id)}
                                  className="cursor-pointer text-gray-400 hover:text-[#7A0808]"
                                  title={rem.completed ? 'Mark incomplete' : 'Mark completed'}
                                >
                                  <CheckCircle2
                                    size={20}
                                    className={rem.completed ? 'text-white fill-[#7A0808]' : 'text-gray-300'}
                                  />
                                </button>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-[#2B3235] truncate">{rem.title}</p>
                                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                                    {rem.date && <span className="flex items-center gap-1"><CalendarIcon size={11} /> {rem.date}</span>}
                                    {rem.time && <span className="flex items-center gap-1"><Clock size={11} /> {rem.time}</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span
                                  className={`px-2.5 py-0.5 text-[9px] font-black uppercase rounded-md ${
                                    rem.priority === 'High'
                                      ? 'bg-red-100 text-red-700 border border-red-200'
                                      : rem.priority === 'Medium'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-blue-100 text-blue-800 border border-blue-200'
                                  }`}
                                >
                                  {rem.priority}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditReminder(rem)}
                                  className="p-1.5 text-gray-400 hover:text-[#7A0808] transition-colors cursor-pointer"
                                  title="Edit reminder"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReminderClick(rem.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                                  title="Delete reminder"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Regular Direct Chat Message Stream */
                <div className="flex-1 p-6 overflow-y-auto space-y-3.5 bg-gray-50/40">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
                      <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#7A0808] border border-red-100 flex items-center justify-center mb-3 shadow-2xs">
                        <MessageCircle size={26} />
                      </div>
                      <p className="text-xs font-black text-[#2B3235]">Direct Coordination with {selectedUser.name}</p>
                      <p className="text-[11px] text-gray-400 mt-1 max-w-xs leading-relaxed">
                        Send a message to coordinate facility bookings, schedule changes, or room equipment setup.
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const sKey = String(m.senderKey || m.senderEmail || m.senderUid || '').toLowerCase();
                      const isMe = sKey === getCanonicalUserKey(currentUserObj);

                      return (
                        <div
                          key={m.id}
                          className={`group relative flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[78%] px-4 py-2.5 rounded-2xl shadow-2xs text-xs relative ${
                              isMe
                                ? 'bg-[#7A0808] text-white rounded-tr-none'
                                : 'bg-white border border-gray-200 text-[#2B3235] rounded-tl-none'
                            }`}
                          >
                            {m.replyTo && (
                              <div
                                className={`mb-1.5 p-2 rounded-lg text-[11px] border-l-2 ${
                                  isMe
                                    ? 'bg-white/15 border-white/80 text-red-100'
                                    : 'bg-gray-100 border-[#7A0808] text-gray-700'
                                }`}
                              >
                                <p className="font-bold text-[10px] opacity-90 flex items-center gap-1">
                                  <CornerUpLeft size={10} /> {m.replyTo.senderName}
                                </p>
                                <p className="truncate text-[10px] mt-0.5 opacity-80">{m.replyTo.text}</p>
                              </div>
                            )}

                            {editingMsgId === m.id ? (
                              <div className="space-y-2 py-1">
                                <textarea
                                  value={editInputText}
                                  onChange={(e) => setEditInputText(e.target.value)}
                                  className="w-full p-2 text-xs bg-white text-[#2B3235] rounded-xl border focus:outline-none font-medium"
                                  rows={2}
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingMsgId(null)}
                                    className="px-2.5 py-1 text-[10px] font-bold bg-white/20 text-white rounded-lg hover:bg-white/30"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit(m)}
                                    className="px-2.5 py-1 text-[10px] font-bold bg-[#7A0808] text-white rounded-lg hover:bg-[#900A0A]"
                                  >
                                    Save Edit
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                                <div
                                  className={`text-[9px] mt-1 flex items-center justify-end gap-1 font-semibold ${
                                    isMe ? 'text-red-200' : 'text-gray-400'
                                  }`}
                                >
                                  <span>{formatMessageTime(m.timestamp)}</span>
                                  {m.edited && <span className="italic">(edited)</span>}
                                  {isMe && (
                                    m.read ? (
                                      <CheckCheck size={14} className="text-amber-300" title="Read by recipient" />
                                    ) : (
                                      <Check size={14} className="text-white/80" title="Delivered" />
                                    )
                                  )}
                                </div>
                              </>
                            )}

                            {/* Hover Actions */}
                            {editingMsgId !== m.id && (
                              <div
                                className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white border border-gray-200 p-1 rounded-xl shadow-2xs z-20 ${
                                  isMe ? '-left-24' : '-right-10'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleStartReply(m)}
                                  className="p-1 text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer"
                                  title="Reply to message"
                                >
                                  <CornerUpLeft size={12} />
                                </button>
                                {isMe && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(m)}
                                      className="p-1 text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer"
                                      title="Edit message"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteMsgClick(m)}
                                      className="p-1 text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                                      title="Delete message"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Replying Banner */}
              {replyToMsg && (
                <div className="px-4 py-2 bg-red-50/90 border-t border-red-100 flex items-center justify-between text-xs flex-shrink-0 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 min-w-0">
                    <CornerUpLeft size={14} className="text-[#7A0808]" />
                    <div className="min-w-0">
                      <span className="font-extrabold text-[#7A0808] text-[11px]">
                        Replying to {replyToMsg.senderName}:
                      </span>
                      <span className="text-gray-600 truncate block text-[11px] font-medium">
                        "{replyToMsg.text}"
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyToMsg(null)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    title="Cancel reply"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Message Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3.5 border-t border-gray-200 bg-white flex items-center gap-3 flex-shrink-0">
                <input
                  type="text"
                  placeholder={
                    selectedUser.isSelf
                      ? 'Save a sticky note or reminder for yourself...'
                      : `Type a message to coordinate with ${selectedUser.name}...`
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 px-4 py-2.5 text-xs border border-gray-200 rounded-xl focus:border-[#7A0808] focus:bg-white focus:outline-none bg-gray-50 font-medium transition-all"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="btn-maroon px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-2xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Send size={14} /> Send
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-red-50 text-[#7A0808] flex items-center justify-center mb-4 border border-red-100 shadow-2xs">
                <MessageCircle size={30} />
              </div>
              <h3 className="font-extrabold text-base text-[#2B3235]">SWU-IFSS User Coordination</h3>
              <p className="text-xs text-gray-500 max-w-sm mt-1 leading-relaxed">
                Select a Dean, Registrar, GSD Staff, or Department Head from the directory on the left to start real-time coordination.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* POP-UP MODAL WHEN CALENDAR DATE IS CLICKED (No Need to Scroll Below!) */}
      {showDayDetailsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-200 space-y-4 animate-in fade-in zoom-in duration-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-shrink-0">
              <h3 className="font-extrabold text-base text-[#2B3235] flex items-center gap-2">
                <CalendarIcon size={18} className="text-[#7A0808]" />
                Schedule for: <span className="text-[#7A0808]">{selectedCalendarDay}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowDayDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowDayDetailsModal(false);
                  setNewNoteText('');
                  setNewNoteDate(selectedCalendarDay);
                  setShowAddNoteModal(true);
                }}
                className="px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
              >
                <StickyNote size={14} /> Add Sticky Note
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDayDetailsModal(false);
                  setEditingReminder(null);
                  setRemTitle('');
                  setRemDate(selectedCalendarDay);
                  setRemTime('09:00');
                  setRemPriority('Medium');
                  setShowAddReminderModal(true);
                }}
                className="btn-maroon px-3 py-1.5 text-xs font-bold rounded-xl shadow-2xs cursor-pointer flex items-center gap-1"
              >
                <Plus size={14} /> Add Reminder
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {selectedDayItems.notes.length === 0 && selectedDayItems.reminders.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  No sticky notes or reminders scheduled for {selectedCalendarDay}. Click buttons above to post one!
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Sticky Notes on Date */}
                  {selectedDayItems.notes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-extrabold text-[#2B3235] uppercase tracking-wider flex items-center gap-1.5">
                        <StickyNote size={14} className="text-amber-600" /> Sticky Notes ({selectedDayItems.notes.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedDayItems.notes.map((n) => {
                          const st = STICKY_COLORS[n.colorTheme || 'amber'] || STICKY_COLORS.amber;
                          return (
                            <div
                              key={n.id}
                              className={`p-3.5 rounded-2xl border ${st.bg} ${st.border} ${st.text} shadow-xs space-y-2 relative`}
                            >
                              <div className="flex items-center justify-between border-b border-black/10 pb-1">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${st.badge}`}>
                                  📌 Sticky Note
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCompleteNote(n)}
                                    className="p-1 cursor-pointer"
                                    title={n.completed ? 'Mark incomplete' : 'Mark done'}
                                  >
                                    <CheckCircle2 size={14} className={n.completed ? 'fill-emerald-600 text-white' : ''} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMsgClick(n)}
                                    className="p-1 cursor-pointer text-red-700"
                                    title="Delete note"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                              <p className={`text-xs font-bold leading-relaxed ${n.completed ? 'line-through opacity-70' : ''}`}>
                                {n.text}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Reminders on Date */}
                  {selectedDayItems.reminders.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-extrabold text-[#2B3235] uppercase tracking-wider flex items-center gap-1.5">
                        <Bell size={14} className="text-[#7A0808]" /> Reminders ({selectedDayItems.reminders.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedDayItems.reminders.map((r) => (
                          <div
                            key={r.id}
                            className={`p-3 rounded-2xl border flex items-center justify-between gap-3 shadow-2xs ${
                              r.completed ? 'bg-gray-50 border-gray-200 opacity-60 line-through' : 'bg-white border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                type="button"
                                onClick={() => toggleReminderCompleted(r.id)}
                                className="cursor-pointer"
                              >
                                <CheckCircle2 size={18} className={r.completed ? 'text-white fill-[#7A0808]' : 'text-gray-300'} />
                              </button>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[#2B3235] truncate">{r.title}</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">{r.time} · {r.priority} Priority</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowDayDetailsModal(false);
                                  handleOpenEditReminder(r);
                                }}
                                className="p-1 text-gray-400 hover:text-[#7A0808]"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteReminderClick(r.id)}
                                className="p-1 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Sticky Note Modal with Rich Cute Soft-to-Hard Color Picker */}
      {showAddNoteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-gray-200 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-[#2B3235] flex items-center gap-2">
                <StickyNote size={16} className="text-amber-600" /> Create Digital Sticky Note
              </h3>
              <button
                type="button"
                onClick={() => setShowAddNoteModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateStickyNoteSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Sticky Note Text
                </label>
                <textarea
                  placeholder="Type your room code, facility note, or scratch task..."
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  className="w-full p-3 text-xs bg-white border border-gray-200 rounded-xl focus:border-[#7A0808] focus:outline-none font-medium shadow-2xs"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Calendar Schedule Date
                </label>
                <DatePicker
                  value={newNoteDate}
                  onChange={(d) => setNewNoteDate(d)}
                  placeholder="Select calendar date"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider flex items-center gap-1">
                  <Palette size={13} className="text-[#7A0808]" /> Pick Sticky Note Color (Soft Pastels to Bold)
                </label>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {Object.keys(STICKY_COLORS).map((cKey) => {
                    const cItem = STICKY_COLORS[cKey];
                    const isSel = newNoteColor === cKey;
                    return (
                      <button
                        key={cKey}
                        type="button"
                        onClick={() => setNewNoteColor(cKey)}
                        className={`p-2 rounded-xl text-[10px] font-bold transition-all border flex items-center justify-center gap-1 cursor-pointer ${
                          isSel ? 'ring-2 ring-[#7A0808] scale-105 shadow-sm font-black' : 'opacity-85 hover:opacity-100'
                        } ${cItem.bg} ${cItem.text} ${cItem.border}`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${cItem.dot}`} />
                        <span className="truncate">{cItem.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="w-1/3 py-2.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-maroon flex-1 py-2.5 rounded-xl text-xs font-bold shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <StickyNote size={14} /> Post Sticky Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forward Personal Note Modal */}
      {forwardingNote && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-gray-200 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-[#2B3235] flex items-center gap-2">
                <Share2 size={16} className="text-[#7A0808]" /> Forward Sticky Note to User
              </h3>
              <button
                type="button"
                onClick={() => setForwardingNote(null)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 italic">
              "{forwardingNote.text}"
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">
                Select Recipient
              </label>
              <CustomSelect
                value={forwardTargetUser ? getCanonicalUserKey(forwardTargetUser) : ''}
                onChange={(e) => {
                  const target = usersList.find((u) => getCanonicalUserKey(u) === e.target.value);
                  setForwardTargetUser(target || null);
                }}
                options={usersList
                  .filter((u) => !u.isSelf)
                  .map((u) => ({
                    value: getCanonicalUserKey(u),
                    label: `${u.name} (${u.role})`,
                  }))}
                placeholder="Select recipient user..."
              />
            </div>

            <div className="pt-2 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForwardingNote(null)}
                className="px-4 py-2 text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!forwardTargetUser}
                onClick={handleForwardNote}
                className="btn-maroon px-5 py-2 text-xs font-bold rounded-xl shadow-2xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send size={14} /> Send Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Personal Reminder Modal with Date & Time Pickers */}
      {(showAddReminderModal || editingReminder) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-gray-200 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-extrabold text-sm text-[#2B3235] flex items-center gap-2">
                <Bell size={16} className="text-[#7A0808]" />
                {editingReminder ? 'Edit Personal Reminder' : 'Create Personal Reminder'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowAddReminderModal(false);
                  setEditingReminder(null);
                }}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveReminderSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Reminder Title / Task
                </label>
                <input
                  type="text"
                  placeholder="e.g., Check Phinma Hall 302 AV Setup for Exam"
                  value={remTitle}
                  onChange={(e) => setRemTitle(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:border-[#7A0808] focus:outline-none font-medium shadow-2xs"
                  required
                />
              </div>

              {/* Quick Time Presets */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Quick Time Presets
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setQuickPreset('tomorrow')}
                    className="px-2.5 py-1 text-[10px] font-bold bg-gray-100 hover:bg-red-50 hover:text-[#7A0808] rounded-lg transition-colors cursor-pointer"
                  >
                    Tomorrow 9 AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPreset('today_evening')}
                    className="px-2.5 py-1 text-[10px] font-bold bg-gray-100 hover:bg-red-50 hover:text-[#7A0808] rounded-lg transition-colors cursor-pointer"
                  >
                    Today 5 PM
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickPreset('next_monday')}
                    className="px-2.5 py-1 text-[10px] font-bold bg-gray-100 hover:bg-red-50 hover:text-[#7A0808] rounded-lg transition-colors cursor-pointer"
                  >
                    Next Mon 9 AM
                  </button>
                </div>
              </div>

              {/* Date & Time Pickers */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">
                    Date Picker
                  </label>
                  <DatePicker
                    value={remDate}
                    onChange={(d) => setRemDate(d)}
                    placeholder="Select date"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">
                    Time Picker
                  </label>
                  <TimePicker
                    value={remTime}
                    onChange={(t) => setRemTime(t)}
                    placeholder="Select time"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Priority Level
                </label>
                <CustomSelect
                  value={remPriority}
                  onChange={(e) => setRemPriority(e.target.value)}
                  options={PRIORITY_OPTIONS}
                  placeholder="Select priority"
                />
              </div>

              <div className="pt-2 border-t border-gray-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddReminderModal(false);
                    setEditingReminder(null);
                  }}
                  className="w-1/3 py-2.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-maroon flex-1 py-2.5 rounded-xl text-xs font-bold shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Bell size={14} /> {editingReminder ? 'Save Changes' : 'Create Reminder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Delete Actions */}
      {confirmModalConfig.isOpen && (
        <ConfirmModal
          title={confirmModalConfig.title}
          message={confirmModalConfig.message}
          confirmText={confirmModalConfig.confirmText}
          cancelText="Cancel"
          variant={confirmModalConfig.variant}
          onConfirm={confirmModalConfig.onConfirm}
          onCancel={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
        />
      )}
    </Layout>
  );
}
