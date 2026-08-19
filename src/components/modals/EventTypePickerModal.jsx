import React from 'react';
import { X, GraduationCap, Users, DoorOpen, Building2 } from 'lucide-react';
import { APPROVAL_TYPES } from '../../constants/approvalWorkflow';

export default function EventTypePickerModal({ onClose, onSelect, selectedRoom }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-md relative p-8 shadow-2xl animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors">
          <X size={20} />
        </button>
        <h2 className="font-black text-lg mb-1" style={{ color: '#7A0808' }}>Room Reservation</h2>
        <p className="text-xs text-gray-500 mb-4">Select the type of event to determine the approval workflow.</p>

        {selectedRoom && (
          <div className="mb-5 p-3 rounded-xl bg-red-50/60 border border-red-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#7A0808] text-white flex items-center justify-center flex-shrink-0">
              <DoorOpen size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#7A0808]">Selected Venue</p>
              <p className="text-xs font-black text-[#2B3235] truncate">
                {selectedRoom.name || selectedRoom.id}
                <span className="font-normal text-gray-500 ml-1">
                  ({selectedRoom.buildingName || selectedRoom.building} {selectedRoom.floorLabel ? `· ${selectedRoom.floorLabel}` : ''})
                </span>
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            className="w-full text-left p-4 rounded-xl border-2 border-gray-100 hover:border-[#7A0808] hover:bg-red-50/40 transition-all group"
            onClick={() => onSelect(APPROVAL_TYPES.ACADEMIC)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors group-hover:bg-[#7A0808] group-hover:text-white" style={{ background: '#FFF0F0', color: '#7A0808' }}>
                <GraduationCap size={20} />
              </div>
              <div>
                <p className="font-bold text-sm text-dark group-hover:text-[#7A0808] transition-colors">Academic Event</p>
                <p className="text-xs text-gray-400">Classes, lectures, academic activities</p>
              </div>
            </div>
          </button>
          <button
            type="button"
            className="w-full text-left p-4 rounded-xl border-2 border-gray-100 hover:border-[#7A0808] hover:bg-red-50/40 transition-all group"
            onClick={() => onSelect(APPROVAL_TYPES.NON_ACADEMIC)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors group-hover:bg-[#7A0808] group-hover:text-white" style={{ background: '#FFF0F0', color: '#7A0808' }}>
                <Users size={20} />
              </div>
              <div>
                <p className="font-bold text-sm text-dark group-hover:text-[#7A0808] transition-colors">Non-Academic Event</p>
                <p className="text-xs text-gray-400">Student activities, org events, campus activities</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
