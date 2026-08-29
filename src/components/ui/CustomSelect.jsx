import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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
  placement = 'auto', // 'auto' | 'bottom' | 'top'
  required = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, placement: 'bottom' });

  const updateCoords = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldPlaceTop = placement === 'top' || (placement === 'auto' && spaceBelow < dropdownHeight && rect.top > dropdownHeight);

    setCoords({
      top: shouldPlaceTop ? undefined : rect.bottom + 6,
      bottom: shouldPlaceTop ? window.innerHeight - rect.top + 6 : undefined,
      left: rect.left,
      width: Math.max(rect.width, 160),
      placement: shouldPlaceTop ? 'top' : 'bottom',
    });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updateCoords();
      const handleScrollOrResize = () => {
        updateCoords();
      };
      window.addEventListener('resize', handleScrollOrResize);
      window.addEventListener('scroll', handleScrollOrResize, true);
      return () => {
        window.removeEventListener('resize', handleScrollOrResize);
        window.removeEventListener('scroll', handleScrollOrResize, true);
      };
    }
  }, [isOpen, placement]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        (!menuRef.current || !menuRef.current.contains(e.target))
      ) {
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
    <div ref={containerRef} className={`relative inline-block w-full font-sans select-none ${className}`}>
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
        onClick={() => {
          if (!disabled) {
            updateCoords();
            setIsOpen(!isOpen);
          }
        }}
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

      {/* Popover Options Card rendered through Portal to avoid modal overflow clipping */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : undefined,
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 999999,
          }}
          className={`bg-white rounded-2xl border border-slate-200 shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-150 max-h-[280px] overflow-y-auto space-y-1 ${menuClassName}`}
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
                        ? 'opacity-40 cursor-not-allowed bg-red-50/40 text-red-900 select-none'
                        : isSelected
                        ? 'bg-red-50 text-[#7A0808] font-bold shadow-2xs cursor-pointer'
                        : 'hover:bg-slate-100 text-slate-700 font-medium cursor-pointer'
                    }`}
                  >
                    <span className={`truncate pr-2 font-medium ${opt.disabled ? 'text-red-900/80' : ''}`}>{opt.label}</span>
                    {opt.disabled ? (
                      <span className="text-[9px] font-black uppercase text-red-700 bg-red-100 px-1.5 py-0.5 rounded border border-red-200 ml-2 shrink-0">
                        Occupied
                      </span>
                    ) : isSelected ? (
                      <Check size={14} className="text-[#7A0808] shrink-0 ml-2" />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
