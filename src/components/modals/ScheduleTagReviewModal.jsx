import React from 'react';
import { X, Clock, User, Building2, Layers } from 'lucide-react';

export default function ScheduleTagReviewModal({ taggerName, buildingName, roomName, item, onClose }) {
  if (!item) return null;
  const r = 10;
  return (
    <div className="modal-overlay z-[1002]" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md shadow-xl relative m-4 border border-gray-100"
        style={{ borderRadius: r }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-base" style={{ color: '#2B3235' }}>Tagged schedule</h2>
            <p className="text-xs font-medium mt-0.5" style={{ color: '#2B3235', opacity: 0.6 }}>
              Tagged by {taggerName}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100" style={{ borderRadius: r }}>
            <X size={18} style={{ color: '#2B3235' }} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className={item.status === 'Approved' ? 'badge-approved' : 'badge-pending'}>{item.status}</span>
            {item.tag && (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 text-purple-900" style={{ borderRadius: r }}>
                {item.tag}
              </span>
            )}
          </div>

          <p className="font-black text-lg" style={{ color: '#2B3235' }}>{item.course}</p>
          <p className="text-sm font-semibold" style={{ color: '#2B3235' }}>{item.subject}</p>

          <div className="space-y-2 text-sm" style={{ color: '#2B3235' }}>
            <p className="flex items-center gap-2">
              <Clock size={16} className="flex-shrink-0 text-[#7A0808]" /> {item.when}
            </p>
            <p className="flex items-center gap-2">
              <User size={16} className="flex-shrink-0 text-[#7A0808]" /> {item.professor}
            </p>
            <p className="flex items-center gap-2">
              <Building2 size={16} className="flex-shrink-0 text-[#7A0808]" /> {buildingName}
            </p>
            <p className="flex items-center gap-2">
              <Layers size={16} className="flex-shrink-0 text-[#7A0808]" /> {roomName}
            </p>
            {item.mode && <p className="text-xs font-bold pt-2">Delivery: {item.mode}</p>}
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" style={{ borderRadius: r }} onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-maroon flex-1 justify-center py-2.5" style={{ borderRadius: r }} onClick={onClose}>
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}

