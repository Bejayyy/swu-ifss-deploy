import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Calendar as CalendarIcon,
  Menu,
  Clock,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import {
  subscribeCalendarEvents,
  deleteCalendarEvent,
} from '../../services/academicCalendarService';
import CreateCalendarEventModal from '../modals/CreateCalendarEventModal';
import AiCalendarScanModal from '../modals/AiCalendarScanModal';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function ModernCalendarView({
  schoolYearId,
  schoolYearLabel = '2026-2027',
  isRegistrar = false,
  onAiScanComplete,
}) {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), today.getDate())
  );

  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [successToast, setSuccessToast] = useState('');
  const [showMonthEventsView, setShowMonthEventsView] = useState(false);

  // Subscribe to real-time events for this school year
  useEffect(() => {
    if (!schoolYearId) return;
    setLoadingEvents(true);
    const unsub = subscribeCalendarEvents(
      schoolYearId,
      (data) => {
        setEvents(data || []);
        setLoadingEvents(false);
      },
      (err) => {
        console.error('Error fetching calendar events:', err);
        setLoadingEvents(false);
      }
    );
    return () => unsub();
  }, [schoolYearId]);

  // Toast timer
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // Selected date ISO string formatted as YYYY-MM-DD
  const selectedDateStr = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  // Get all events mapped by YYYY-MM-DD date key
  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      if (!ev.startDate) return;
      const start = new Date(ev.startDate + 'T00:00:00');
      const end = ev.endDate ? new Date(ev.endDate + 'T00:00:00') : start;

      // Span across all dates in range
      const curr = new Date(start);
      while (curr <= end) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const d = String(curr.getDate()).padStart(2, '0');
        const dateKey = `${y}-${m}-${d}`;

        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(ev);

        curr.setDate(curr.getDate() + 1);
      }
    });
    return map;
  }, [events]);

  // Events on currently selected date
  const currentSelectedEvents = useMemo(() => {
    return eventsByDate[selectedDateStr] || [];
  }, [eventsByDate, selectedDateStr]);

  // Events in currently displayed month
  const currentMonthEvents = useMemo(() => {
    return events.filter((ev) => {
      if (!ev.startDate) return false;
      const start = new Date(ev.startDate + 'T00:00:00');
      return start.getFullYear() === selectedYear && start.getMonth() === selectedMonth;
    });
  }, [events, selectedYear, selectedMonth]);

  // Generate calendar grid matrix (6 rows x 7 days)
  const calendarMatrix = useMemo(() => {
    const firstDayOfMonth = new Date(selectedYear, selectedMonth, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
    const daysInCurrentMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    const matrix = [];
    let currentDay = 1;
    let nextMonthDay = 1;

    for (let row = 0; row < 6; row++) {
      const week = [];
      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;

        if (cellIndex < startingDayOfWeek) {
          // Trailing previous month days
          const prevDay = daysInPrevMonth - (startingDayOfWeek - cellIndex - 1);
          const prevDate = new Date(selectedYear, selectedMonth - 1, prevDay);
          week.push({
            date: prevDate,
            dayNumber: prevDay,
            isCurrentMonth: false,
            isPrevMonth: true,
          });
        } else if (currentDay <= daysInCurrentMonth) {
          // Current month days
          const cellDate = new Date(selectedYear, selectedMonth, currentDay);
          week.push({
            date: cellDate,
            dayNumber: currentDay,
            isCurrentMonth: true,
          });
          currentDay++;
        } else {
          // Leading next month days
          const nextDate = new Date(selectedYear, selectedMonth + 1, nextMonthDay);
          week.push({
            date: nextDate,
            dayNumber: nextMonthDay,
            isCurrentMonth: false,
            isNextMonth: true,
          });
          nextMonthDay++;
        }
      }
      matrix.push(week);
      if (currentDay > daysInCurrentMonth && nextMonthDay > 7) {
        break; // stop generating unnecessary trailing weeks
      }
    }

    return matrix;
  }, [selectedYear, selectedMonth]);

  // Handlers
  const handlePrevYear = () => setSelectedYear((y) => y - 1);
  const handleNextYear = () => setSelectedYear((y) => y + 1);

  const handleSelectDate = (cell) => {
    setSelectedDate(cell.date);
    if (!cell.isCurrentMonth) {
      setSelectedYear(cell.date.getFullYear());
      setSelectedMonth(cell.date.getMonth());
    }
  };

  const handleDeleteEvent = async (eventId, eventTitle) => {
    if (!window.confirm(`Are you sure you want to remove "${eventTitle}"?`)) return;
    try {
      await deleteCalendarEvent(schoolYearId, eventId);
      setSuccessToast('Event deleted.');
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  // Helper to format 2-digit numbers
  const pad2 = (n) => String(n).padStart(2, '0');

  return (
    <div className="space-y-4">
      {/* Top Banner with Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-red-50 text-[#7A0808] flex items-center justify-center font-black shadow-xs">
            <CalendarIcon size={18} />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-900">
              Interactive School Calendar
            </h3>
            <p className="text-xs font-semibold text-[#7A0808] mt-0.5">
              SY {schoolYearLabel} · {events.length} Scheduled Events
            </p>
          </div>
        </div>

        {isRegistrar && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              className="px-4 py-2.5 rounded-xl bg-[#7A0808] hover:bg-[#600000] text-white text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-98 border border-red-900/30"
              style={{ backgroundColor: '#7A0808' }}
            >
              <Sparkles size={15} className="text-amber-300" />
              <span>AI Scan Calendar (PDF/Image)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingEvent(null);
                setShowCreateModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-[#7A0808] border border-red-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Event</span>
            </button>
          </div>
        )}
      </div>

      {/* Success Notification */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} />
          <span>{successToast}</span>
        </div>
      )}

      {/* MAIN DUAL-PANE CALENDAR CARD (Matching User Design) */}
      <div className="bg-white rounded-3xl shadow-xl border border-gray-200/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[520px]">
        
        {/* LEFT PANE (Maroon Brand #7A0808 Background) */}
        <div
          className="md:col-span-4 lg:col-span-4 text-white p-7 flex flex-col justify-between relative shadow-inner"
          style={{ backgroundColor: '#7A0808', backgroundImage: 'linear-gradient(180deg, #8B0B0B 0%, #7A0808 50%, #600505 100%)' }}
        >
          {/* Top minimal header icon */}
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-md flex items-center justify-center text-white">
              <Menu size={18} />
            </div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">
              {FULL_MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </span>
          </div>

          {/* Huge Date Display */}
          <div className="my-6">
            <div className="text-7xl lg:text-8xl font-black text-white tracking-tighter leading-none select-none drop-shadow-sm">
              {pad2(selectedDate.getDate())}
            </div>
            <div className="text-sm font-black uppercase tracking-widest text-white/90 mt-2">
              {DAY_NAMES[selectedDate.getDay()]}
            </div>
          </div>

          {/* Current Events Section */}
          <div className="flex-1 space-y-2.5 my-2">
            <div className="flex items-center justify-between border-b border-white/20 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-white">
                Current Events
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
                {currentSelectedEvents.length}
              </span>
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {currentSelectedEvents.length === 0 ? (
                <p className="text-xs text-white/70 italic pt-1">
                  No scheduled events on this date.
                </p>
              ) : (
                currentSelectedEvents.map((ev, idx) => {
                  const isHoliday = ev.category === 'holiday' || ev.isNoClass;
                  const isExam = ev.category === 'exam';
                  return (
                    <div
                      key={ev.id || idx}
                      className="p-2.5 rounded-xl bg-white/15 hover:bg-white/20 transition-all border border-white/15 text-xs space-y-1 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 flex-1 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                            isHoliday ? 'bg-amber-300' : isExam ? 'bg-blue-300' : 'bg-pink-300'
                          }`} />
                          <span className="font-bold text-white text-xs leading-snug">
                            {ev.title}
                          </span>
                        </div>

                        {isRegistrar && (
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(ev.id, ev.title)}
                            className="text-white/60 hover:text-white transition-colors p-1 opacity-0 group-hover:opacity-100"
                            title="Delete Event"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>

                      {ev.description && (
                        <p className="text-[10px] text-white/80 pl-3.5 leading-tight">
                          {ev.description}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Link to see all events this month */}
            <button
              type="button"
              onClick={() => setShowMonthEventsView(!showMonthEventsView)}
              className="text-[11px] font-semibold text-white/90 hover:text-white underline cursor-pointer pt-1 block"
            >
              {showMonthEventsView ? 'Hide month events' : `See all events in ${MONTH_NAMES[selectedMonth]} (${currentMonthEvents.length})`}
            </button>
          </div>

          {/* Bottom Pinned Actions */}
          <div className="pt-4 border-t border-white/20 space-y-2">
            {isRegistrar && (
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="w-full flex items-center justify-between text-xs font-bold text-white/95 hover:text-white p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all cursor-pointer border border-white/15"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-300" />
                  <span>Upload Calendar PDF</span>
                </span>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">Scan AI</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setEditingEvent(null);
                setShowCreateModal(true);
              }}
              className="w-full flex items-center justify-between text-xs font-bold text-white hover:text-white/90 group transition-all cursor-pointer pt-1"
            >
              <span className="group-hover:translate-x-0.5 transition-transform">
                Create an Event
              </span>
              <div className="w-7 h-7 rounded-full bg-white/20 group-hover:bg-white group-hover:text-[#7A0808] flex items-center justify-center transition-all shadow-xs">
                <Plus size={16} />
              </div>
            </button>
          </div>
        </div>

        {/* RIGHT PANE (Clean White Calendar Grid) */}
        <div className="md:col-span-8 lg:col-span-8 p-7 bg-white flex flex-col justify-between">
          
          {/* Top Bar: Year Navigator */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <span className="text-xs font-extrabold text-[#7A0808] uppercase tracking-wider">
                Academic Year {selectedYear}
              </span>
            </div>

            {/* Year Navigator (◀ 2026 ▶) */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePrevYear}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-800 transition-colors cursor-pointer"
                title="Previous Year"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-base font-black text-gray-700 select-none">
                {selectedYear}
              </span>
              <button
                type="button"
                onClick={handleNextYear}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-800 transition-colors cursor-pointer"
                title="Next Year"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Month Selector Bar (Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec) */}
          <div className="py-4 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[500px] gap-1 px-1">
              {MONTH_NAMES.map((name, index) => {
                const isActive = selectedMonth === index;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setSelectedMonth(index);
                      setSelectedDate(new Date(selectedYear, index, 1));
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer select-none ${
                      isActive
                        ? 'font-black text-gray-900 bg-gray-100 border border-gray-200 shadow-2xs'
                        : 'font-semibold text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Days of Week Header (SUN MON TUE WED THU FRI SAT) */}
          <div className="grid grid-cols-7 text-center py-2 text-[11px] font-black text-gray-600 tracking-wider select-none">
            {WEEKDAYS.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          {/* Date Matrix (6 Rows x 7 Columns) */}
          <div className="grid grid-cols-7 gap-y-2.5 gap-x-1 flex-1 items-center my-1 select-none">
            {calendarMatrix.map((week, wIdx) =>
              week.map((cell, cIdx) => {
                const y = cell.date.getFullYear();
                const m = String(cell.date.getMonth() + 1).padStart(2, '0');
                const d = String(cell.date.getDate()).padStart(2, '0');
                const cellDateStr = `${y}-${m}-${d}`;

                const isSelected = cellDateStr === selectedDateStr;
                const cellEvents = eventsByDate[cellDateStr] || [];
                const hasEvents = cellEvents.length > 0;
                const hasHoliday = cellEvents.some((e) => e.category === 'holiday' || e.isNoClass);
                const hasExam = cellEvents.some((e) => e.category === 'exam');

                return (
                  <div
                    key={`${wIdx}-${cIdx}`}
                    onClick={() => handleSelectDate(cell)}
                    className="flex items-center justify-center p-1 relative"
                  >
                    <button
                      type="button"
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-[#7A0808] text-white font-black shadow-md scale-105'
                          : cell.isCurrentMonth
                          ? 'text-gray-700 font-bold hover:bg-gray-100'
                          : 'text-gray-300 font-medium hover:text-gray-500'
                      }`}
                    >
                      <span>{pad2(cell.dayNumber)}</span>

                      {/* Event Dot Indicator (Top Right of Number) */}
                      {hasEvents && !isSelected && (
                        <span
                          className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                            hasHoliday
                              ? 'bg-red-500'
                              : hasExam
                              ? 'bg-blue-500'
                              : 'bg-purple-600'
                          }`}
                        />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Legend of Categories */}
          <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-500 font-semibold">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span>Holiday (No Class)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>Exam Period</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                <span>University Event</span>
              </span>
            </div>

            <div className="text-[10px] text-gray-400">
              Selected: <strong className="text-gray-700">{formatFullDate(selectedDate)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* MONTH EVENTS EXPANDED VIEW (If requested) */}
      {showMonthEventsView && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h4 className="text-xs font-black text-gray-900 flex items-center gap-2">
              <BookOpen size={15} className="text-[#7A0808]" />
              <span>All Events in {FULL_MONTH_NAMES[selectedMonth]} {selectedYear} ({currentMonthEvents.length})</span>
            </h4>
            <button
              type="button"
              onClick={() => setShowMonthEventsView(false)}
              className="text-xs font-bold text-gray-400 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          {currentMonthEvents.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">No events recorded for this month.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentMonthEvents.map((ev, idx) => (
                <div key={ev.id || idx} className="p-3 rounded-xl border border-gray-200 bg-gray-50/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-900 truncate">{ev.title}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-[#7A0808]">
                      {ev.startDate}
                    </span>
                  </div>
                  {ev.description && <p className="text-[10px] text-gray-500">{ev.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Create / Edit Event */}
      {showCreateModal && (
        <CreateCalendarEventModal
          schoolYearId={schoolYearId}
          initialDate={selectedDateStr}
          editingEvent={editingEvent}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(msg) => setSuccessToast(msg)}
        />
      )}

      {/* MODAL 2: AI Calendar Scanner */}
      {showAiModal && (
        <AiCalendarScanModal
          schoolYearId={schoolYearId}
          schoolYearLabel={schoolYearLabel}
          onClose={() => setShowAiModal(false)}
          onSuccess={(msg) => {
            setSuccessToast(msg);
            if (onAiScanComplete) onAiScanComplete();
          }}
        />
      )}
    </div>
  );
}

function formatFullDate(d) {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
