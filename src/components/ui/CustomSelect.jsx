import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select option',
  label = '',
  name = '',
  className = '',
  buttonClassName = '',
  menuClassName = '',
  disabled = false,
  size = 'md', // 'sm' | 'md'
  placement = 'bottom', // 'bottom' | 'top'
  required = false,
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
  const formattedOptions = (options || []).map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      const val = opt.value !== undefined ? opt.value : (opt.id !== undefined ? opt.id : (opt.code !== undefined ? opt.code : opt.label));
      const lbl = opt.label !== undefined ? opt.label : (opt.name !== undefined ? opt.name : (opt.title !== undefined ? opt.title : String(val)));
      return {
        value: val,
        label: lbl,
        disabled: Boolean(opt.disabled),
      };
    }
    return { value: opt, label: String(opt), disabled: false };
  });

  const selectedOption = formattedOptions.find((opt) => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : (value !== undefined && value !== null && value !== '' ? String(value) : placeholder);
  const isPlaceholder = !selectedOption && (value === undefined || value === null || value === '');

  const handleSelect = (optionValue) => {
    if (disabled) return;
    if (onChange) {
      onChange({
        target: {
          name: name || undefined,
          value: optionValue,
        },
      });
    }
    setIsOpen(false);
  };

  const isSmall = size === 'sm';

  return (
    <div ref={containerRef} className={`relative inline-block w-full font-sans select-none ${isOpen ? 'z-[90]' : 'z-[10]'} ${className}`}>
      {/* Hidden input for HTML form validation if required */}
      {required && (
        <input
          type="text"
          name={name}
          value={value ?? ''}
          required={required}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
        />
      )}

      {/* Plain Text Trigger Box with Downward Chevron Arrow & Comfortable Padding */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white rounded-xl border flex items-center justify-between transition-all cursor-pointer shadow-2xs ${
          isSmall ? 'px-3 py-1.5 text-xs font-semibold' : 'px-4 py-2.5 text-xs font-medium'
        } ${
          isOpen
            ? 'border-[#7A0808] ring-1 ring-[#7A0808] bg-white'
            : 'border-slate-200 hover:border-slate-300 bg-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${buttonClassName}`}
        style={{ color: '#2B3235' }}
      >
        <span className={`truncate pr-2 ${isPlaceholder ? 'text-slate-400 font-normal' : 'text-slate-800 font-semibold'}`}>
          {displayLabel}
        </span>
        <ChevronDown
          size={isSmall ? 14 : 16}
          className={`text-slate-500 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#7A0808]' : ''
          }`}
        />
      </button>

      {/* Popover Options Card with Ample Space on Every Side */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 ${
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } bg-white rounded-2xl border border-slate-200 shadow-2xl p-2 z-[100] animate-in fade-in zoom-in-95 duration-150 min-w-[160px] max-h-[280px] overflow-y-auto space-y-1 ${menuClassName}`}
        >
          {label && (
            <div className="px-4 pt-2 pb-1.5 border-b border-slate-100 mb-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
            </div>
          )}
          <div className="space-y-1">
            {formattedOptions.length === 0 ? (
              <div className="px-4 py-3 text-center text-xs text-slate-400 font-medium">
                No options available
              </div>
            ) : (
              formattedOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (!opt.disabled) handleSelect(opt.value);
                    }}
                    className={`w-full text-left px-4 ${isSmall ? 'py-2' : 'py-2.5'} text-xs rounded-xl flex items-center justify-between transition-all ${
                      opt.disabled
                        ? 'opacity-40 cursor-not-allowed text-slate-400'
                        : isSelected
                        ? 'bg-red-50 text-[#7A0808] font-bold shadow-2xs cursor-pointer'
                        : 'hover:bg-slate-100 text-slate-700 font-medium cursor-pointer'
                    }`}
                  >
                    <span className="truncate pr-2 font-medium">{opt.label}</span>
                    {isSelected && <Check size={14} className="text-[#7A0808] shrink-0 ml-2" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
