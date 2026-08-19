import React from 'react';

const COLOR_MAP = {
  maroon: { bg: 'bg-red-50 text-[#7A0808] border-red-100' },
  red: { bg: 'bg-red-50 text-[#7A0808] border-red-100' },
  emerald: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  green: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  approved: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  rose: { bg: 'bg-rose-50 text-rose-700 border-rose-100' },
  rejected: { bg: 'bg-rose-50 text-rose-700 border-rose-100' },
  amber: { bg: 'bg-amber-50 text-amber-700 border-amber-100' },
  yellow: { bg: 'bg-amber-50 text-amber-700 border-amber-100' },
  pending: { bg: 'bg-amber-50 text-amber-700 border-amber-100' },
  blue: { bg: 'bg-blue-50 text-blue-700 border-blue-100' },
  purple: { bg: 'bg-purple-50 text-purple-700 border-purple-100' },
  gray: { bg: 'bg-slate-50 text-slate-700 border-slate-200' },
  slate: { bg: 'bg-slate-50 text-slate-700 border-slate-200' },
  neutral: { bg: 'bg-slate-50 text-slate-700 border-slate-200' },
};

export function StatCardItem({ label, value, subtext, icon: Icon, color = 'blue', onClick }) {
  const colorKey = (color || 'blue').toString().toLowerCase();
  const theme = COLOR_MAP[colorKey] || COLOR_MAP.blue;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${theme.bg} shadow-2xs group-hover:scale-105 transition-transform`}>
          {Icon && <Icon size={20} strokeWidth={2} />}
        </div>
        <span className={`font-black text-slate-900 tabular-nums ${typeof value === 'string' && value.length > 8 ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'}`}>
          {value}
        </span>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-700 leading-tight mb-0.5">{label}</p>
        {subtext && <p className="text-[11px] font-semibold text-slate-400">{subtext}</p>}
      </div>
    </div>
  );
}

export default function ProgressStatCards({ items = [] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {items.map((item, idx) => (
        <StatCardItem
          key={item.label || idx}
          label={item.label}
          value={item.value}
          subtext={item.subtext || item.description || item.subText}
          icon={item.icon}
          color={item.color || item.accent || 'blue'}
          onClick={item.onClick}
        />
      ))}
    </div>
  );
}
