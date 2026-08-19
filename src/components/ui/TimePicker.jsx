import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock } from 'lucide-react';

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')); // 01–12
const MINUTES_15 = ['00', '15', '30', '45'];
const MINUTES_30 = ['00', '30'];

function parseTimeString(val) {
  if (!val) return { hour: '08', minute: '00', period: 'AM' };
  const [hStr, mStr] = val.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ? mStr.padStart(2, '0') : '00';
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h = h - 12;
  return { hour: String(h).padStart(2, '0'), minute: m, period };
}

function toTimeString(hour, minute, period) {
  let h = parseInt(hour, 10);
  if (period === 'AM') { if (h === 12) h = 0; }
  else { if (h !== 12) h = h + 12; }
  return `${String(h).padStart(2, '0')}:${minute}`;
}

function formatDisplay(val) {
  if (!val) return '';
  const { hour, minute, period } = parseTimeString(val);
  return `${hour}:${minute} ${period}`;
}

function ScrollColumn({ items, selected, onSelect, label }) {
  const ref = useRef(null);

  const scrollToSelected = useCallback(() => {
    const idx = items.indexOf(selected);
    if (idx !== -1 && ref.current) {
      ref.current.scrollTop = idx * 32 - 32;
    }
  }, [selected, items]);

  useEffect(() => { scrollToSelected(); }, [scrollToSelected]);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</span>
      <div
        ref={ref}
        className="h-[128px] overflow-y-auto overflow-x-hidden w-[52px] scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="py-2">
          {items.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onSelect(item)}
              className={`w-full h-8 rounded-lg text-sm transition-all cursor-pointer flex items-center justify-center font-medium ${
                selected === item
                  ? 'bg-[#7A0808] text-white font-bold shadow-sm'
                  : 'text-gray-600 hover:bg-red-50 hover:text-[#7A0808]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimePickerCard({ value, onChange, onClose, step = 15 }) {
  const parsed = parseTimeString(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState(parsed.period);

  const minuteOptions = step === 30 ? MINUTES_30 : MINUTES_15;
  const snapMinute = (m) => minuteOptions.includes(m) ? m : minuteOptions[0];

  const handleApply = () => {
    const snapped = snapMinute(minute);
    if (onChange) onChange(toTimeString(hour, snapped, period));
    if (onClose) onClose();
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 w-[220px] z-50 select-none font-sans">
      <div className="flex items-center gap-1.5 mb-3">
        <Clock size={13} className="text-[#7A0808]" />
        <span className="text-xs font-bold text-gray-700">Select Time</span>
      </div>

      {/* Live preview */}
      <div className="text-center mb-3 py-2 bg-red-50 rounded-xl border border-red-100">
        <span className="text-xl font-black text-[#7A0808] tracking-tight">{hour}:{snapMinute(minute)}</span>
        <span className="text-sm font-bold text-[#7A0808] ml-1.5">{period}</span>
      </div>

      {/* Columns */}
      <div className="flex items-start justify-center gap-1 mb-3">
        <ScrollColumn items={HOURS} selected={hour} onSelect={setHour} label="Hour" />
        <div className="flex items-center justify-center h-[128px] mt-4">
          <span className="text-lg font-black text-gray-300">:</span>
        </div>
        <ScrollColumn items={minuteOptions} selected={snapMinute(minute)} onSelect={setMinute} label="Min" />

        {/* AM/PM */}
        <div className="flex flex-col items-center gap-0.5 ml-1">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">AM/PM</span>
          <div className="flex flex-col gap-1 mt-2">
            {['AM', 'PM'].map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                className={`w-10 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  period === p
                    ? 'bg-[#7A0808] text-white shadow-sm'
                    : 'border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-[#7A0808] hover:border-[#7A0808]'
                }`}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex flex-wrap gap-1 mb-3">
        {[{ label: '8:00 AM', val: '08:00' }, { label: '12:00 PM', val: '12:00' }, { label: '5:00 PM', val: '17:00' }].map(({ label, val }) => (
          <button key={val} type="button"
            onClick={() => { const p = parseTimeString(val); setHour(p.hour); setMinute(p.minute); setPeriod(p.period); }}
            className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-[10px] font-semibold text-gray-600 hover:bg-red-50 hover:border-[#7A0808] hover:text-[#7A0808] transition-all cursor-pointer">
            {label}
          </button>
        ))}
      </div>

      <button type="button" onClick={handleApply}
        className="w-full py-2 bg-[#7A0808] hover:bg-[#600000] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm">
        Set Time
      </button>
    </div>
  );
}

export default function TimePicker({ value, onChange, placeholder = 'Select time', className = '', disabled = false, required = false, step = 15 }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative inline-block w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          readOnly
          value={formatDisplay(value)}
          placeholder={placeholder}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          required={required}
          disabled={disabled}
          className={`w-full cursor-pointer pr-9 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-medium text-gray-800 placeholder:text-gray-300 focus:border-[#7A0808] focus:ring-2 focus:ring-[#7A0808]/10 focus:outline-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 ${isOpen ? 'border-[#7A0808] ring-2 ring-[#7A0808]/10' : ''} ${className}`}
        />
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`absolute right-3 transition-colors cursor-pointer p-0.5 ${disabled ? 'opacity-40' : isOpen ? 'text-[#7A0808]' : 'text-gray-400 hover:text-[#7A0808]'}`}
        >
          <Clock size={14} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute left-0 mt-1.5 z-50">
          <TimePickerCard
            value={value}
            onChange={(val) => { if (onChange) onChange(val); setIsOpen(false); }}
            onClose={() => setIsOpen(false)}
            step={step}
          />
        </div>
      )}
    </div>
  );
}
