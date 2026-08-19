import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select option',
  label = '',
  className = '',
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format options if passed as array of strings/numbers or objects
  const formattedOptions = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: opt.value ?? opt.id ?? opt.label,
        label: opt.label ?? opt.name ?? String(opt.value),
      };
    }
    return { value: opt, label: String(opt) };
  });

  const selectedOption = formattedOptions.find((opt) => String(opt.value) === String(value)) || {
    value,
    label: value !== undefined && value !== null && value !== '' ? String(value) : placeholder,
  };

  const handleSelect = (optionValue) => {
    if (disabled) return;
    if (onChange) {
      onChange({ target: { value: optionValue } });
    }
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative inline-block w-full font-sans select-none ${className}`}>
      {/* Plain Text Trigger Box with Downward Chevron Arrow & Comfortable Padding */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white rounded-xl border px-4 py-2.5 text-xs font-medium flex items-center justify-between transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? 'border-[#7A0808] ring-1 ring-[#7A0808] bg-white'
            : 'border-slate-200 hover:border-slate-300 bg-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ color: '#2B3235' }}
      >
        <span className="truncate pr-3 font-medium text-slate-800">{selectedOption.label}</span>
        <ChevronDown
          size={16}
          className={`text-slate-500 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#7A0808]' : ''
          }`}
        />
      </button>

      {/* Popover Options Card with Ample Space on Every Side */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-2xl border border-slate-200/90 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 min-w-[160px] max-h-[280px] overflow-y-auto space-y-1">
          {label && (
            <div className="px-4 pt-2 pb-1.5 border-b border-slate-100 mb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
            </div>
          )}
          <div className="space-y-1">
            {formattedOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={idx}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-4 py-2.5 text-xs rounded-xl flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-red-50 text-[#7A0808] font-bold shadow-2xs'
                      : 'hover:bg-slate-100 text-slate-700 font-medium'
                  }`}
                >
                  <span className="truncate pr-2 font-medium">{opt.label}</span>
                  {isSelected && <Check size={14} className="text-[#7A0808] shrink-0 ml-2" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
