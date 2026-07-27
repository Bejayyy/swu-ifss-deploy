import React, { useState } from 'react';
import { X, CheckCircle, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatCollegeName } from '../../constants/colleges';

export default function AcademicDetailModal({ request, onClose }) {
  const { updateRequest } = useApp();
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const handleApprove = () => {
    updateRequest(request.id, { status: 'Approved' });
    onClose();
  };

  const handleReject = () => {
    if (!rejectReason.trim()) { setShowRejectInput(true); return; }
    updateRequest(request.id, { status: 'Rejected', rejectReason });
    onClose();
  };

  const statusColor = {
    Pending: '#92400E', Approved: '#065F46', Rejected: '#991B1B', Draft: '#1E40AF'
  }[request.status] || '#2B3235';
  const statusBg = {
    Pending: '#FEF3C7', Approved: '#D1FAE5', Rejected: '#FEE2E2', Draft: '#DBEAFE'
  }[request.status] || '#f4f5f7';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg relative flex flex-col" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="px-7 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700"><X size={20} /></button>
          <div className="text-center">
            <p className="text-sm font-black tracking-widest" style={{ color: '#7A0808' }}>SOUTHWESTERN UNIVERSITY</p>
            <p className="text-xs font-bold tracking-widest" style={{ color: '#7A0808' }}>PHINMA</p>
            <p className="font-bold text-sm mt-1 text-dark">ON-CAMPUS ACTIVITY PERMIT</p>
            <p className="text-xs text-gray-400 mt-0.5">Academic Request</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          {/* Status */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Status</span>
            <span className="text-xs font-black px-3 py-1 rounded-full" style={{ background: statusBg, color: statusColor }}>{request.status}</span>
          </div>

          {/* Request info grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-5">
            {[
              ['Request Type', request.reqType],
              ['Department', formatCollegeName(request.college || request.department || request.nameOfOrg)],
              ['Course Code', request.courseCode],
              ['Course Description', request.courseDesc],
              ['Instructor', request.instructor || request.requestor],
              ['Semester', request.semester],
              ['No. of Students', request.numStudents || request.participants],
              ['Venue', request.venue || request.room],
              ['Date', request.dateStart || request.dateField],
              ['Time', `${request.timeStart} - ${request.timeEnd}`],
              ['Date Filed', request.dateFiled],
              ['Building', request.building],
            ].filter(([,v]) => v).map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                <p className="text-sm font-semibold text-dark mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {request.objectives && (
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Objectives</p>
              <p className="text-sm text-dark">{request.objectives}</p>
            </div>
          )}
          {request.specificVenue && (
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Specific Venue Details</p>
              <p className="text-sm text-dark">{request.specificVenue}</p>
            </div>
          )}

          {/* Reject reason */}
          {(showRejectInput || request.rejectReason) && (
            <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-100">
              <label className="form-label text-red-700">Reason for Rejection</label>
              {request.status !== 'Rejected' ? (
                <textarea className="form-input resize-none mt-1" rows={3} placeholder="Provide reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              ) : (
                <p className="text-sm text-red-700 mt-1">{request.rejectReason}</p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons - only if pending */}
        {request.status === 'Pending' && (
          <div className="px-7 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
            <button
              onClick={() => { if (!showRejectInput) setShowRejectInput(true); else handleReject(); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border-2 transition-all"
              style={{ borderColor: '#991B1B', color: '#991B1B' }}
            >
              <XCircle size={16} /> {showRejectInput ? 'Confirm Reject' : 'Request Modification'}
            </button>
            <button onClick={handleApprove} className="btn-maroon flex-1 justify-center py-2.5 rounded-xl">
              <CheckCircle size={16} /> Approve & Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
