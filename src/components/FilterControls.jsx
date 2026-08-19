import React from 'react';
import { CheckCircle, XCircle, Clock, Filter, Layers } from 'lucide-react';

const MAROON = '#7A0808';
const TEXT = '#2B3235';
const BADGE = '#7A0808';
const CONTAINER_BG = '#F9FAFB';
const R = 10;

const STATUS_ICONS = {
  All: <Filter size={13} />,
  Pending: <Clock size={13} />,
  Approved: <CheckCircle size={13} />,
  Rejected: <XCircle size={13} />,
};

/**
 * Primary category switcher — shrink-wrapped container, 10px radii (not pills).
 */
export function CategoryFilterTabs({
  value,
  onChange,
  academicCount,
  nonAcademicCount,
  labels = ['Academic', 'Non-Academic'],
  hideAcademic = false,
  hideNonAcademic = false,
}) {
  const items = [
    { key: 'academic', label: labels[0], count: academicCount, hidden: hideAcademic },
    { key: 'non-academic', label: labels[1], count: nonAcademicCount, hidden: hideNonAcademic },
  ].filter((item) => !item.hidden);

  return (
    <div className="inline-flex w-fit flex-wrap items-center p-1 gap-1 bg-white border border-gray-200 rounded-2xl shadow-2xs max-w-full">
      {items.map(({ key, label, count }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`px-4 py-2 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer rounded-xl ${
              active
                ? 'bg-[#7A0808] text-white shadow-2xs'
                : 'bg-transparent text-[#2B3235] hover:bg-gray-100/70'
            }`}
          >
            <span>{label}</span>
            <span
              className="min-w-[20px] h-[20px] px-1.5 flex items-center justify-center text-[10px] font-black text-white rounded-lg bg-[#F59E0B] shadow-2xs leading-none"
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Status row — shrink-wrapped, clean white container, uniform 12px button radius with theme icons.
 */
export function StatusFilterRow({ value, onChange, options = ['All', 'Pending', 'Approved', 'Rejected'] }) {
  return (
    <div className="inline-flex w-fit flex-wrap items-center p-1 gap-1 bg-white border border-gray-200 rounded-2xl shadow-2xs max-w-full">
      {options.map((opt) => {
        const active = value === opt;
        const icon = STATUS_ICONS[opt];

        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer rounded-xl ${
              active
                ? 'bg-[#7A0808] text-white shadow-2xs'
                : 'bg-transparent text-[#2B3235] hover:bg-gray-100/70'
            }`}
          >
            {icon && <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>}
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Building / floor pills — 10px radius; active maroon fill or outline per variant.
 */
export function PillFilterRow({ options, value, onChange, variant = 'filled' }) {
  return (
    <div className="flex flex-wrap gap-2 w-fit max-w-full">
      {options.map((opt) => {
        const key = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const active = value === key;
        if (variant === 'outline') {
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`px-4 py-2 text-xs font-bold transition-all border cursor-pointer ${
                active ? '' : 'hover:bg-[#7A0808] hover:text-white hover:border-[#7A0808]'
              }`}
              style={{
                borderRadius: R,
                background: active ? '#7A0808' : '#fff',
                color: active ? '#fff' : TEXT,
                borderColor: active ? MAROON : '#E5E7EB',
              }}
            >
              {label}
            </button>
          );
        }
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              active ? '' : 'hover:bg-[#7A0808] hover:text-white hover:border-[#7A0808]'
            }`}
            style={{
              borderRadius: R,
              background: active ? MAROON : '#fff',
              color: active ? '#fff' : TEXT,
              border: active ? 'none' : '1px solid #E5E7EB',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
