import React, { useState } from 'react';
import {
  X,
  Wrench,
  AlertTriangle,
  Calendar,
  Clock,
  DoorOpen,
  Building,
  User,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock3,
  XCircle,
  FileText,
  Trash2,
  Code,
  ChevronDown,
  ChevronUp,
  Layers,
} from 'lucide-react';

export default function DeveloperMaintenanceDetailsModal({
  item,
  onClose,
  onDelete,
}) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!item) return null;

  const isSchedule = Boolean(item.startDate || item.isSchedule || item.durationType);
  const isReport = !isSchedule || Boolean(item.issue || item.reportedByName);

  // Status styling
  const getStatusBadge = (st) => {
    const s = String(st || '').toLowerCase();
    if (s === 'completed' || s === 'resolved') {
      return { bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', icon: CheckCircle2, label: s };
    }
    if (s === 'in-progress' || s === 'in_progress' || s === 'acknowledged') {
      return { bg: 'bg-blue-100 text-blue-900 border-blue-300', icon: Clock3, label: s };
    }
    if (s === 'scheduled' || s === 'pending') {
      return { bg: 'bg-amber-100 text-amber-900 border-amber-300', icon: AlertCircle, label: s };
    }
    return { bg: 'bg-gray-100 text-gray-900 border-gray-300', icon: AlertCircle, label: s || 'Unknown' };
  };

  const getPriorityBadge = (p) => {
    const pr = String(p || 'medium').toLowerCase();
    if (pr === 'urgent') return 'bg-rose-600 text-white font-black';
    if (pr === 'high') return 'bg-rose-100 text-rose-800 border-rose-200 font-bold';
    if (pr === 'medium') return 'bg-amber-100 text-amber-900 border-amber-200 font-semibold';
    return 'bg-gray-100 text-gray-700 border-gray-200 font-medium';
  };

  const statusBadge = getStatusBadge(item.status);
  const StatusIcon = statusBadge.icon;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-red-50/70 via-white to-amber-50/50 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${statusBadge.bg}`}
              >
                <StatusIcon size={12} />
                {statusBadge.label}
              </span>

              <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-900 border-amber-200">
                {isSchedule ? 'Maintenance Schedule' : 'Issue Report'}
              </span>

              {item.priority && (
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${getPriorityBadge(item.priority)}`}>
                  Priority: {item.priority}
                </span>
              )}

              <span className="text-xs text-gray-400 font-mono">
                ID: {item.id}
              </span>
            </div>

            <h3 className="font-black text-xl text-gray-900 leading-tight">
              {item.roomName || 'Campus Room'}{item.buildingName ? ` · ${item.buildingName}` : ''}
            </h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {isSchedule ? 'Facility Maintenance Block Details' : 'Reported Facility Issue / Incident'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-sm">
          {/* Main Info */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 text-[#7A0808] flex items-center justify-center flex-shrink-0 mt-0.5">
                {isSchedule ? <Wrench size={16} /> : <AlertTriangle size={16} />}
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {isSchedule ? 'Reason / Scope of Work' : 'Reported Problem Description'}
                </p>
                <p className="text-sm font-bold text-gray-900 leading-snug whitespace-pre-wrap">
                  {item.reason || item.issue || 'No description provided.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200/60 text-xs">
              <div>
                <p className="text-gray-400 font-medium">Room Name:</p>
                <p className="font-bold text-gray-800">{item.roomName || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Building / Floor:</p>
                <p className="font-bold text-gray-800">
                  {item.buildingName || '—'}{item.floor ? ` (Floor ${item.floor})` : ''}
                </p>
              </div>
              {isSchedule && (
                <>
                  <div>
                    <p className="text-gray-400 font-medium">Schedule Dates:</p>
                    <p className="font-bold text-[#7A0808]">{item.startDate} to {item.endDate}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 font-medium">Duration Type:</p>
                    <p className="font-bold text-gray-800 capitalize">
                      {item.durationType === 'hours' ? `Quick Fix (${item.durationHours || 2}h at ${item.startTime || '08:00'})` : 'Full Days'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Personnel / Reporter Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Scheduled By / Reported By */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7A0808]">
                <User size={15} />
                <span>{isSchedule ? 'Scheduled By' : 'Reported By'}</span>
              </div>
              <p className="text-xs font-bold text-gray-900">
                {item.scheduledByName || item.reportedByName || 'Staff Member'}
              </p>
              {item.reportedByEmail && (
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <Mail size={12} className="text-gray-400" />
                  <span>{item.reportedByEmail}</span>
                </p>
              )}
              <p className="text-[10px] font-mono text-gray-400">
                UID: {item.scheduledByUid || item.reportedByUid || 'N/A'}
              </p>
            </div>

            {/* Acknowledged / Resolved / Status info */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7A0808]">
                <Clock size={15} />
                <span>Status & Resolution</span>
              </div>
              {item.acknowledgedByName && (
                <p className="text-xs text-gray-700">
                  Acknowledged by: <strong>{item.acknowledgedByName}</strong>
                </p>
              )}
              {item.resolution && (
                <div className="text-xs text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  <p className="font-bold">Resolution:</p>
                  <p>{item.resolution}</p>
                </div>
              )}
              {!item.acknowledgedByName && !item.resolution && (
                <p className="text-xs text-gray-500 italic">
                  Status currently marked as {item.status || 'pending'}.
                </p>
              )}
              {item.scheduleId && (
                <p className="text-[11px] font-mono text-gray-500">
                  Linked Schedule ID: {item.scheduleId}
                </p>
              )}
            </div>
          </div>

          {/* Raw JSON Developer Toggle */}
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowRawJson((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
            >
              <Code size={13} />
              <span>{showRawJson ? 'Hide Raw Firestore Document' : 'View Raw Firestore Document (JSON)'}</span>
              {showRawJson ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showRawJson && (
              <pre className="mt-2 p-3 bg-gray-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-60">
                {JSON.stringify(item, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="btn-delete text-xs py-2 px-3.5 gap-1.5 cursor-pointer flex items-center text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl font-bold transition-colors"
          >
            <Trash2 size={14} />
            <span>Delete Maintenance Record</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
