import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function CalendarCard({ value, onChange, onClose, minDate = null, maxDate = null }) {
  const initialDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [currentYear, setCurrentYear] = useState(isNaN(initialDate.getFullYear()) ? new Date().getFullYear() : initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(isNaN(initialDate.getMonth()) ? new Date().getMonth() : initialDate.getMonth());
  const [viewMode, setViewMode] = useState('days'); // 'days' | 'months' | 'years'

  const selectedDateStr = value ? value : '';
  const todayStr = new Date().toISOString().split('T')[0];

  const handlePrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };
  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const prevMonthDays = Array.from({ length: firstDayOfMonth }, (_, i) => daysInPrevMonth - firstDayOfMonth + i + 1);
  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const totalGridCells = prevMonthDays.length + currentMonthDays.length;
  const nextDaysCount = totalGridCells >= 35 ? (42 - totalGridCells) % 7 === 0 ? (42 - totalGridCells) : (35 - totalGridCells) : (35 - totalGridCells);
  const nextMonthDays = Array.from({ length: Math.max(0, nextDaysCount) }, (_, i) => i + 1);

  const handleSelectDay = (day) => {
    const m = String(currentMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const dateStr = `${currentYear}-${m}-${d}`;
    if (minDate && dateStr < minDate) return;
    if (maxDate && dateStr > maxDate) return;
    if (onChange) onChange(dateStr);
    if (onClose) onClose();
  };

  const yearOptions = Array.from({ length: 41 }, (_, i) => 2000 + i);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 w-[288px] z-50 select-none font-sans">
      {/* Header */}
      {viewMode === 'days' && (
        <div className="flex items-center justify-between mb-3 px-0.5">
          <button type="button" onClick={handlePrevMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer">
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('months')}
            className="text-sm font-bold text-gray-800 hover:text-[#7A0808] transition-colors px-2 py-0.5 rounded-lg hover:bg-red-50 cursor-pointer"
          >
            {MONTH_NAMES[currentMonth]} {currentYear}
          </button>
          <button type="button" onClick={handleNextMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer">
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {viewMode === 'months' && (
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <button type="button" onClick={() => setCurrentYear(y => y - 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer">
              <ChevronLeft size={15} />
            </button>
            <button type="button" onClick={() => setViewMode('years')}
              className="text-sm font-bold text-gray-800 hover:text-[#7A0808] transition-colors px-2 py-0.5 rounded-lg hover:bg-red-50 cursor-pointer">
              {currentYear}
            </button>
            <button type="button" onClick={() => setCurrentYear(y => y + 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_SHORT.map((m, idx) => (
              <button key={m} type="button"
                onClick={() => { setCurrentMonth(idx); setViewMode('days'); }}
                className={`py-2 rounded-lg text-xs transition-all cursor-pointer font-medium ${idx === currentMonth ? 'bg-[#7A0808] text-white font-bold shadow-sm' : 'hover:bg-red-50 hover:text-[#7A0808] text-gray-700'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'years' && (
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <button type="button" onClick={() => setCurrentYear(y => y - 12)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer">
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-bold text-gray-800">Select Year</span>
            <button type="button" onClick={() => setCurrentYear(y => y + 12)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-500 hover:text-[#7A0808] transition-colors cursor-pointer">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 max-h-[180px] overflow-y-auto">
            {yearOptions.map((y) => (
              <button key={y} type="button"
                onClick={() => { setCurrentYear(y); setViewMode('months'); }}
                className={`py-2 rounded-lg text-xs transition-all cursor-pointer font-medium ${y === currentYear ? 'bg-[#7A0808] text-white font-bold shadow-sm' : 'hover:bg-red-50 hover:text-[#7A0808] text-gray-700'}`}>
                {y}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'days' && (
        <>
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">{day}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {/* Prev month — not clickable */}
            {prevMonthDays.map((day, idx) => (
              <div key={`prev-${idx}`} className="py-1.5 text-gray-300 cursor-default">{day}</div>
            ))}

            {/* Current month */}
            {currentMonthDays.map((day) => {
              const m = String(currentMonth + 1).padStart(2, '0');
              const d = String(day).padStart(2, '0');
              const dateStr = `${currentYear}-${m}-${d}`;
              const isSelected = selectedDateStr === dateStr;
              const isToday = todayStr === dateStr;
              const isDisabled = (minDate && dateStr < minDate) || (maxDate && dateStr > maxDate);

              return (
                <button
                  key={`curr-${day}`}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleSelectDay(day)}
                  className={`py-1.5 rounded-lg text-xs transition-all flex items-center justify-center font-normal ${
                    isDisabled
                      ? 'text-gray-300 cursor-not-allowed bg-gray-50/40 opacity-50'
                      : isSelected
                      ? 'bg-[#7A0808] text-white shadow-sm scale-[1.05] font-semibold cursor-pointer'
                      : isToday
                      ? 'border border-[#7A0808] text-[#7A0808] bg-red-50/60 hover:bg-[#7A0808] hover:text-white cursor-pointer'
                      : 'text-gray-700 hover:bg-red-50 hover:text-[#7A0808] cursor-pointer'
                  }`}
                  title={isDisabled ? (minDate && dateStr < minDate ? 'Date must be at least 7 days in advance' : 'Date unavailable') : ''}
                >
                  {day}
                </button>
              );
            })}

            {/* Next month — not clickable */}
            {nextMonthDays.map((day, idx) => (
              <div key={`next-${idx}`} className="py-1.5 text-gray-300 cursor-default">{day}</div>
            ))}
          </div>

          {/* Today shortcut (only if today is not disabled by minDate) */}
          {(!minDate || todayStr >= minDate) && (
            <div className="mt-3 pt-2.5 border-t border-gray-100 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setCurrentMonth(today.getMonth());
                  setCurrentYear(today.getFullYear());
                  const m = String(today.getMonth() + 1).padStart(2, '0');
                  const d = String(today.getDate()).padStart(2, '0');
                  if (onChange) onChange(`${today.getFullYear()}-${m}-${d}`);
                  if (onClose) onClose();
                }}
                className="text-[11px] font-semibold text-[#7A0808] hover:underline transition-colors cursor-pointer"
              >
                Today
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DatePicker({ value, onChange, placeholder = 'Select date', className = '', readOnly = false, required = false, minDate = null, maxDate = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDisplay = (val) => {
    if (!val) return '';
    const d = new Date(val + 'T00:00:00');
    if (isNaN(d.getTime())) return val;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          readOnly
          value={formatDisplay(value)}
          placeholder={placeholder}
          onClick={() => !readOnly && setIsOpen(!isOpen)}
          required={required}
          className={`w-full cursor-pointer pr-9 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-medium text-gray-800 placeholder:text-gray-300 focus:border-[#7A0808] focus:ring-2 focus:ring-[#7A0808]/10 focus:outline-none transition-all ${isOpen ? 'border-[#7A0808] ring-2 ring-[#7A0808]/10' : ''} ${className}`}
        />
        <div
          onClick={() => !readOnly && setIsOpen(!isOpen)}
          className={`absolute right-3 transition-colors cursor-pointer p-0.5 ${isOpen ? 'text-[#7A0808]' : 'text-gray-400 hover:text-[#7A0808]'}`}
        >
          <CalendarIcon size={14} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <CalendarCard
            value={value}
            onChange={(val) => { if (onChange) onChange(val); setIsOpen(false); }}
            onClose={() => setIsOpen(false)}
            minDate={minDate}
            maxDate={maxDate}
          />
        </div>
      )}
    </div>
  );
}
