import React from 'react';

const COLOR_MAP = {
  blue: { bg: 'bg-blue-100/70 text-blue-600' },
  green: { bg: 'bg-emerald-100/70 text-emerald-600' },
  emerald: { bg: 'bg-emerald-100/70 text-emerald-600' },
  approved: { bg: 'bg-emerald-100/70 text-emerald-600' },
  red: { bg: 'bg-rose-100/70 text-rose-600' },
  rejected: { bg: 'bg-rose-100/70 text-rose-600' },
  amber: { bg: 'bg-amber-100/70 text-amber-600' },
  yellow: { bg: 'bg-amber-100/70 text-amber-600' },
  pending: { bg: 'bg-amber-100/70 text-amber-600' },
  purple: { bg: 'bg-purple-100/70 text-purple-600' },
  maroon: { bg: 'bg-red-100/70 text-[#800000]' },
  gray: { bg: 'bg-slate-100 text-slate-500' },
  slate: { bg: 'bg-slate-100 text-slate-500' },
  neutral: { bg: 'bg-slate-100 text-slate-500' },
};

export function StatCardItem({ label, value, icon: Icon, color = 'blue', onClick }) {
  const colorStyle = COLOR_MAP[color] || COLOR_MAP[color?.toLowerCase()] || COLOR_MAP.blue;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-[16px] border border-slate-200/70 p-5 shadow-2xs flex flex-col justify-between transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-11 h-11 rounded-[12px] flex items-center justify-center ${colorStyle.bg} ${colorStyle.text}`}>
          {Icon && <Icon size={20} strokeWidth={2} />}
        </div>
        <span className="text-2xl sm:text-3xl font-extrabold text-slate-800 tabular-nums">
          {typeof value === 'number' ? value : value}
        </span>
      </div>
      <p className="text-[13px] font-bold text-slate-700 leading-tight">{label}</p>
    </div>
  );
}

export default function ProgressStatCards({ items = [] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {items.map((item, idx) => (
        <StatCardItem
          key={item.label || idx}
          label={item.label}
          value={item.value}
          icon={item.icon}
          color={item.color || item.accent || 'blue'}
          onClick={item.onClick}
        />
      ))}
    </div>
  );
}
