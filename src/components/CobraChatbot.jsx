import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Send,
  Sparkles,
  X,
  Loader2,
  AlertCircle,
  RotateCcw,
  Calendar,
  Layers,
  Users,
  Building2,
  ExternalLink,
  PlusCircle,
  CheckCircle2,
  Maximize2,
  Minimize2,
  DoorOpen,
} from 'lucide-react';
import chatbotFace from '../assets/chatbot.png';
import { queryGeminiWithRAG, generateQuickPrompts, preloadSystemData } from '../services/ragChatbotService';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import RoomWeeklyScheduleModal from './modals/RoomWeeklyScheduleModal';

const BOT_NAME = 'COBRA Assistant';

/**
 * Extracts embedded [ROOM_ACTION:{...}] tags from message text
 * Returns { cleanText, rooms }
 */
function parseRoomActionsFromText(rawText = '') {
  if (!rawText || typeof rawText !== 'string') {
    return { cleanText: '', rooms: [] };
  }

  const rooms = [];
  const roomTagRegex = /\[ROOM_ACTION:(\{.*?\})\]/g;
  let match;

  while ((match = roomTagRegex.exec(rawText)) !== null) {
    try {
      const parsedRoom = JSON.parse(match[1]);
      if (parsedRoom && (parsedRoom.roomCode || parsedRoom.name)) {
        rooms.push(parsedRoom);
      }
    } catch (e) {
      console.warn('Failed to parse room action tag:', match[1]);
    }
  }

  // Remove the action tags from display text
  const cleanText = rawText.replace(/\[ROOM_ACTION:\{.*?\}\]/g, '').trim();

  return { cleanText, rooms };
}

/**
 * Resolves both tagged rooms AND detects any mentioned rooms from allRoomsList
 * Guarantees that any room mentioned in the bot response gets interactive action buttons
 */
function resolveRoomsForMessage(rawText, cleanText, parsedRooms = [], allRoomsList = []) {
  const combined = [];
  const seenKeys = new Set();

  const normalize = (str) => String(str || '').toLowerCase().replace(/[\s\-_]/g, '');

  // 1. Add explicitly tagged rooms and enrich with full building/floor data
  parsedRooms.forEach((r) => {
    const key = normalize(r.roomCode || r.name || r.id);
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      const match = allRoomsList.find(
        (ar) => normalize(ar.roomCode || ar.name || ar.id) === key
      );
      combined.push(match ? { ...match, ...r } : r);
    }
  });

  // 2. Scan response text for any room code mentions from allRoomsList
  if (allRoomsList.length > 0) {
    const textToScan = `${cleanText || ''} ${rawText || ''}`.toLowerCase();
    const normalizedText = textToScan.replace(/[\s\-_]/g, '');

    allRoomsList.forEach((r) => {
      const codeKey = normalize(r.roomCode || r.name || r.id);
      if (codeKey.length >= 3) {
        // Test normalized inclusion (e.g. "ph101" in text) OR word boundary match
        if (normalizedText.includes(codeKey) || textToScan.includes(r.roomCode?.toLowerCase() || '')) {
          if (!seenKeys.has(codeKey)) {
            seenKeys.add(codeKey);
            combined.push(r);
          }
        }
      }
    });
  }

  return combined;
}

/**
 * Clean markdown formatter for bot responses
 */
function FormattedMessageText({ text }) {
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 leading-relaxed text-xs">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Section header
        if (trimmed.startsWith('### ') || trimmed.endsWith(':') && trimmed.length < 50 && !trimmed.includes('.')) {
          const headerText = trimmed.replace(/^###\s*/, '');
          return (
            <p key={idx} className="font-extrabold text-[12px] text-gray-900 mt-2 mb-0.5">
              {headerText}
            </p>
          );
        }

        // Bullet list item
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const content = trimmed.replace(/^[•\-*]\s*/, '');
          return (
            <div key={idx} className="flex items-start gap-1.5 ml-1">
              <span className="text-[#7A0808] font-bold text-[10px] mt-0.5">•</span>
              <span className="flex-1">
                {renderBoldText(content)}
              </span>
            </div>
          );
        }

        // Standard line
        return (
          <p key={idx}>
            {renderBoldText(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Render bold text for **bold** markers
 */
function renderBoldText(str) {
  if (!str) return '';
  const parts = str.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-black text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export default function CobraChatbot() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { buildingList } = useApp();
  const { openReservation, modals: reservationModals } = useRoomReservationFlow();

  const [open, setOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataPreloaded, setDataPreloaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeScheduleRoom, setActiveScheduleRoom] = useState(null);
  const [quickPrompts, setQuickPrompts] = useState([
    'Find an available room for 40 students with AC',
    'Which rooms have projectors and computers?',
    'How do I file a room reservation permit?',
    'Show me rooms in Merlo Building',
  ]);

  const messagesEndRef = useRef(null);
  const launcherRef = useRef(null);
  const launcherDragRef = useRef(null);
  const suppressLauncherClickRef = useRef(false);
  const [launcherPosition, setLauncherPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('swu_ifss_chatbot_launcher_position');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const storageKey = `swu_ifss_cobra_chat_${profile?.uid || 'user'}`;

  useEffect(() => {
    const handlePointerMove = (event) => {
      const drag = launcherDragRef.current;
      if (!drag) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) drag.moved = true;

      const size = 56;
      const edge = 8;
      setLauncherPosition({
        left: Math.max(edge, Math.min(window.innerWidth - size - edge, drag.left + deltaX)),
        top: Math.max(edge, Math.min(window.innerHeight - size - edge, drag.top + deltaY)),
      });
    };

    const handlePointerEnd = () => {
      const drag = launcherDragRef.current;
      if (!drag) return;
      launcherDragRef.current = null;
      if (drag.moved) {
        suppressLauncherClickRef.current = true;
        setLauncherPosition((position) => {
          if (position) localStorage.setItem('swu_ifss_chatbot_launcher_position', JSON.stringify(position));
          return position;
        });
        window.setTimeout(() => { suppressLauncherClickRef.current = false; }, 100);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    window.addEventListener('blur', handlePointerEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      window.removeEventListener('blur', handlePointerEnd);
    };
  }, []);

  const handleLauncherPointerDown = (event) => {
    event.preventDefault();
    const rect = launcherRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    launcherDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
  };

  // Flatten all rooms from AppContext building data
  const allRoomsList = useMemo(() => {
    if (!buildingList || !Array.isArray(buildingList)) return [];
    const out = [];
    buildingList.forEach((b) => {
      (b.floorData || []).forEach((f) => {
        (f.rooms || []).forEach((r) => {
          out.push({
            ...r,
            id: r.id || r.name || r.roomCode,
            roomCode: r.roomCode || r.name || r.id,
            name: r.name || r.roomCode || r.id,
            buildingName: b.name || 'Main Building',
            buildingId: b.id,
            buildingPrefix: b.prefix || b.code || '',
            floor: f.floor || 1,
            floorId: f.floorId || '',
            capacity: Number(r.capacity) || 40,
            type: r.type || 'Classroom',
            equipment: r.equipment || [],
            status: r.status || 'Available',
          });
        });
      });
    });
    return out;
  }, [buildingList]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Load chat history from localStorage or set initial welcome
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to load chat history:', err);
    }

    const defaultWelcome = [
      {
        id: 'intro',
        role: 'bot',
        text: `Hello! I am **${BOT_NAME}**, your official SWU-IFSS intelligent facility & scheduling assistant. 🐍\n\nI can help you find available rooms, check weekly class and exam schedules, view room equipment, and guide you through reservation permits.`,
        rawText: `Hello! I am **${BOT_NAME}**, your official SWU-IFSS intelligent facility & scheduling assistant. 🐍\n\nI can help you find available rooms, check weekly class and exam schedules, view room equipment, and guide you through reservation permits.`,
        rooms: [],
        timestamp: Date.now(),
      },
    ];
    setMessages(defaultWelcome);
  }, [storageKey]);

  // 2. Save chat history to localStorage whenever messages update
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      } catch (err) {
        console.warn('Failed to persist chat messages:', err);
      }
    }
  }, [messages, storageKey]);

  // 3. Scroll to bottom when messages change
  useEffect(() => {
    if (open) {
      scrollToBottom();
    }
  }, [messages, open, loading]);

  // 4. Load dynamic quick prompts and preload system data
  useEffect(() => {
    generateQuickPrompts()
      .then((prompts) => {
        if (prompts && prompts.length > 0) {
          setQuickPrompts(prompts);
        }
      })
      .catch((err) => console.error('Error loading quick prompts:', err));
  }, []);

  useEffect(() => {
    if (open && !dataPreloaded) {
      preloadSystemData()
        .then(() => setDataPreloaded(true))
        .catch((err) => console.warn('Preload note:', err));
    }
  }, [open, dataPreloaded]);

  // Clear chat history
  const handleClearHistory = () => {
    const welcome = [
      {
        id: `intro-${Date.now()}`,
        role: 'bot',
        text: `Conversation cleared! How can I assist you with SWU-IFSS facilities or room reservations today?`,
        rawText: `Conversation cleared! How can I assist you with SWU-IFSS facilities or room reservations today?`,
        rooms: [],
        timestamp: Date.now(),
      },
    ];
    setMessages(welcome);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {}
  };

  // Handle navigating to Room Details page in the directory
  const handleOpenRoomDirectory = (room) => {
    const targetRoomId = room.id || room.roomCode || room.name;
    const roomState = {
      room: {
        ...room,
        id: targetRoomId,
        name: room.name || room.roomCode || targetRoomId,
      },
      buildingId: room.buildingId || '',
      buildingName: room.buildingName || 'Main Building',
      floor: room.floor || 1,
      floorId: room.floorId || '',
    };

    setOpen(false); // Close chat to view the page
    navigate(`/room/${targetRoomId}`, { state: roomState });
  };

  // Handle sending a message
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      rawText: trimmed,
      rooms: [],
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const botMessageId = `bot-${Date.now()}`;
    const initialBotMessage = {
      id: botMessageId,
      role: 'bot',
      text: '',
      rawText: '',
      rooms: [],
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, initialBotMessage]);

    try {
      const conversationHistory = messages.slice(-6);
      let accumulatedResponse = '';

      for await (const chunk of queryGeminiWithRAG(userMessage.text, conversationHistory)) {
        accumulatedResponse += chunk;
        const { cleanText, rooms: taggedRooms } = parseRoomActionsFromText(accumulatedResponse);
        const resolvedRooms = resolveRoomsForMessage(accumulatedResponse, cleanText, taggedRooms, allRoomsList);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === botMessageId
              ? {
                  ...msg,
                  text: cleanText,
                  rawText: accumulatedResponse,
                  rooms: resolvedRooms,
                }
              : msg
          )
        );
      }

      if (!open) {
        setUnreadCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error('Error in chatbot query:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === botMessageId
            ? {
                ...msg,
                text: '⚠️ Sorry, I encountered an issue processing your query. Please make sure your Gemini API key is configured.',
                error: true,
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = (prompt) => {
    setInput(prompt);
  };

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <button
        ref={launcherRef}
        type="button"
        onPointerDown={handleLauncherPointerDown}
        onDragStart={(event) => event.preventDefault()}
        onClick={() => {
          if (suppressLauncherClickRef.current) return;
          setOpen(true);
          setUnreadCount(0);
        }}
        className={`fixed z-[70] w-14 h-14 rounded-full shadow-xl flex items-center justify-center border-2 border-white print:hidden transition-[transform,box-shadow] duration-200 hover:scale-105 active:scale-95 group cursor-grab active:cursor-grabbing touch-none bg-[#7A0808] ${launcherPosition ? '' : 'bottom-24 right-5'}`}
        style={launcherPosition ? { left: launcherPosition.left, top: launcherPosition.top } : undefined}
        title={`Open ${BOT_NAME} · Drag to move it away from content`}
        aria-label={`Open ${BOT_NAME}. Drag this button to move it away from content.`}
      >
        <div className="relative w-full h-full rounded-full overflow-hidden p-1.5 bg-[#7A0808] flex items-center justify-center">
          <img
            src={chatbotFace}
            alt="COBRA AI Assistant"
            draggable="false"
            className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-300"
          />
        </div>

        {/* Active Live Status Indicator */}
        <span className="absolute bottom-0 right-0 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white shadow-2xs" />
        </span>

        {/* Unread Badge */}
        {unreadCount > 0 && !open && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full text-[11px] font-black shadow-md bg-[#F59E0B] text-white border-2 border-white animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Chat Window Modal */}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-end p-3 sm:p-6 print:hidden">
          <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px]" onClick={() => setOpen(false)} />

          <div
            className={`relative w-full transition-all duration-300 rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white flex flex-col ${
              isExpanded
                ? 'max-w-2xl h-[90vh]'
                : 'max-w-lg h-[640px] max-h-[92vh]'
            }`}
          >
            {/* Chatbot Header */}
            <div
              className="px-4 py-3 flex items-center justify-between text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7A0808 0%, #500000 100%)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 p-1 flex items-center justify-center border border-white/30 shadow-inner">
                  <img src={chatbotFace} alt="Cobra bot" className="w-full h-full object-contain" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-black tracking-tight">{BOT_NAME}</p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/90 text-white">
                      RAG AI
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-white/80">
                    SWU-IFSS Facility & Scheduling Assistant
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Clear Chat History */}
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title="Clear conversation history"
                >
                  <RotateCcw size={15} />
                </button>

                {/* Expand / Shrink */}
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="hidden sm:block p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title={isExpanded ? 'Restore window size' : 'Expand window'}
                >
                  {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>

                {/* Close */}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                  title="Close Assistant"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Live System Status Subheader */}
            <div className="px-4 py-2 bg-gradient-to-r from-red-50 to-amber-50/60 border-b border-red-100 flex items-center justify-between text-xs flex-shrink-0">
              <div className="flex items-center gap-1.5 text-[#7A0808] font-bold text-[11px]">
                <Sparkles size={13} className="text-[#7A0808]" />
                <span>RAG Grounded • Anti-Hallucination Active</span>
              </div>
              <span className="text-[10px] text-gray-500 font-semibold">
                {dataPreloaded ? '✓ Live Inventory Cached' : 'Connecting to Firestore...'}
              </span>
            </div>

            {/* Message Stream Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#FDFDFD]">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow-2xs ${
                        isUser
                          ? 'bg-gray-800 text-white font-black text-[11px]'
                          : msg.error
                          ? 'bg-red-100 text-red-700'
                          : 'bg-[#7A0808] p-0.5'
                      }`}
                    >
                      {isUser ? (
                        profile?.displayName?.[0] || 'U'
                      ) : msg.error ? (
                        <AlertCircle size={14} />
                      ) : (
                        <img src={chatbotFace} alt="Bot" className="w-full h-full object-contain" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div className="flex flex-col space-y-2 max-w-[85%]">
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-2xs ${
                          isUser
                            ? 'bg-[#7A0808] text-white rounded-tr-none'
                            : msg.error
                            ? 'bg-red-50 border border-red-200 text-red-900 rounded-tl-none'
                            : 'bg-white border border-gray-200/90 text-gray-800 rounded-tl-none'
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        ) : (
                          <FormattedMessageText text={msg.text} />
                        )}
                      </div>

                      {/* Interactive Room Directory & Action Cards if suggested by COBRA */}
                      {!isUser && Array.isArray(msg.rooms) && msg.rooms.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                            Room Directory & Details ({msg.rooms.length})
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            {msg.rooms.map((room, rIdx) => (
                              <div
                                key={`${room.roomCode || room.id}-${rIdx}`}
                                className="bg-white rounded-xl p-3 border border-red-100/90 shadow-2xs hover:border-[#7A0808]/50 transition-all"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <Building2 size={13} className="text-[#7A0808] flex-shrink-0" />
                                    <span className="font-black text-xs text-gray-900 truncate">
                                      {room.roomCode || room.name || room.id}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded truncate">
                                      {room.buildingName || 'Main Building'} · Floor {room.floor || 1}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex-shrink-0">
                                    {room.capacity ? `${room.capacity} seats` : 'Available'}
                                  </span>
                                </div>

                                {room.type && (
                                  <p className="text-[11px] font-medium text-gray-600 mb-2">
                                    Type: <span className="font-bold text-gray-800">{room.type}</span>
                                    {room.equipment && room.equipment.length > 0 && (
                                      <span className="text-gray-400 font-normal"> · {room.equipment.slice(0, 3).join(', ')}</span>
                                    )}
                                  </p>
                                )}

                                {/* Action Buttons */}
                                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100 flex-wrap">
                                  {/* 1. DIRECTORY BUTTON: Opens Room Details */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRoomDirectory(room)}
                                    className="flex-1 min-w-[120px] px-2.5 py-1.5 rounded-lg bg-[#7A0808] hover:bg-[#900A0A] text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                                    title="Open Room Details in College / Building Directory"
                                  >
                                    <ExternalLink size={12} /> View Details
                                  </button>

                                  {/* 2. SCHEDULE BUTTON: Opens Weekly Schedule Modal */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveScheduleRoom({
                                        roomCode: room.roomCode || room.name || room.id,
                                        name: room.name || room.roomCode || room.id,
                                        buildingName: room.buildingName || 'Main Building',
                                        floorNumber: room.floor || 1,
                                        capacity: room.capacity || 40,
                                        type: room.type || 'Classroom',
                                      });
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                    title="View Interactive Weekly Schedule"
                                  >
                                    <Calendar size={12} /> Schedule
                                  </button>

                                  {/* 3. RESERVE BUTTON: Opens Reservation Wizard */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openReservation({
                                        building: room.buildingName || '',
                                        buildingId: room.buildingId || '',
                                        room: room.id || room.roomCode || '',
                                        designatedVenue: `${room.roomCode || room.id}, ${room.buildingName || 'Main Building'}`,
                                      });
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                    title="Book / Reserve this Room"
                                  >
                                    <PlusCircle size={12} /> Reserve
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Live Loading Indicator */}
              {loading && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-[#7A0808] p-0.5">
                    <img src={chatbotFace} alt="Bot" className="w-full h-full object-contain" />
                  </div>
                  <div className="rounded-2xl rounded-tl-none px-3.5 py-2.5 text-xs bg-white border border-gray-200 text-gray-700 shadow-2xs flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-[#7A0808]" />
                    <span className="font-medium text-gray-600">Retrieving system data & analyzing query...</span>
                  </div>
                </div>
              )}

              {/* Quick Prompt Suggestions */}
              {!loading && messages.length <= 3 && (
                <div className="pt-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
                    Suggested Questions
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="text-[11px] px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-[#7A0808] hover:text-[#7A0808] hover:bg-red-50/50 transition-all text-left font-medium cursor-pointer shadow-2xs"
                        onClick={() => handleQuickPrompt(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <div className="p-3 border-t border-gray-100 bg-white flex-shrink-0">
              <div className="flex items-center gap-2">
                <input
                  className="form-input text-xs flex-1 px-3.5 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7A0808] focus:border-transparent font-medium"
                  placeholder="Ask about rooms, schedules, equipment, or policies..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={loading}
                  autoFocus
                />
                <button
                  type="button"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90 cursor-pointer shadow-md flex-shrink-0"
                  style={{ background: '#7A0808' }}
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  title="Send query"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 text-center font-medium">
                COBRA Assistant • Grounded strictly on real-time SWU-IFSS data
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Room Weekly Schedule Modal opened from AI Suggestion Card */}
      {activeScheduleRoom && (
        <RoomWeeklyScheduleModal
          isOpen={Boolean(activeScheduleRoom)}
          room={activeScheduleRoom}
          onClose={() => setActiveScheduleRoom(null)}
        />
      )}

      {/* Reservation Flow Modals */}
      {reservationModals}
    </>
  );
}
