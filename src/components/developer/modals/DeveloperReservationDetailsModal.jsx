import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  User,
  Mail,
  Phone,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock3,
  XCircle,
  Building,
  GraduationCap,
  Layers,
  Trash2,
  Code,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function DeveloperReservationDetailsModal({
  reservation,
  onClose,
  onDelete,
}) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!reservation) return null;

  const isAcademic = (reservation.type || '').toLowerCase().includes('academic');
  const status = (reservation.status || 'pending').toLowerCase();

  const getStatusBadge = (st) => {
    switch (st) {
      case 'approved':
        return {
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          icon: CheckCircle2,
          label: 'Approved',
        };
      case 'in-progress':
      case 'in_progress':
      case 'pending':
        return {
          bg: 'bg-amber-100 text-amber-900 border-amber-300',
          icon: Clock3,
          label: reservation.status || 'Pending Review',
        };
      case 'rejected':
        return {
          bg: 'bg-rose-100 text-rose-900 border-rose-300',
          icon: XCircle,
          label: 'Rejected',
        };
      case 'draft':
        return {
          bg: 'bg-gray-100 text-gray-800 border-gray-300',
          icon: AlertCircle,
          label: 'Draft',
        };
      default:
        return {
          bg: 'bg-blue-100 text-blue-900 border-blue-300',
          icon: AlertCircle,
          label: reservation.status || 'Unknown',
        };
    }
  };

  const badge = getStatusBadge(status);
  const StatusIcon = badge.icon;
  const approvalRecords = reservation.approvalRecords || reservation.approvalSteps || [];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-red-50/70 via-white to-amber-50/50 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badge.bg}`}
              >
                <StatusIcon size={12} />
                {badge.label}
              </span>

              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  isAcademic
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-purple-50 text-purple-800 border-purple-200'
                }`}
              >
                {isAcademic ? 'Academic Request' : 'Non-Academic Request'}
              </span>

              <span className="text-xs text-gray-400 font-mono">
                ID: {reservation.id}
              </span>
            </div>

            <h3 className="font-black text-xl text-gray-900 leading-tight">
              {reservation.title || reservation.activity || 'Room Reservation'}
            </h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              {reservation.college || reservation.department || 'General Facility Reservation'}
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
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-sm">
          {/* Main Grid: Requestor & Venue */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Requestor Info */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7A0808]">
                <User size={15} />
                <span>Requestor Information</span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-700">
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Name:</span>
                  <span className="font-bold text-gray-900">
                    {reservation.requestor || reservation.requestedBy || 'N/A'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Email:</span>
                  <span className="font-medium text-gray-800">
                    {reservation.requestorEmail || reservation.createdByEmail || 'N/A'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Contact:</span>
                  <span className="font-medium text-gray-800">
                    {reservation.contactNumber || 'N/A'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Organization:</span>
                  <span className="font-medium text-gray-800">
                    {reservation.nameOfOrg || reservation.department || 'N/A'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Date Filed:</span>
                  <span className="font-medium text-gray-800">
                    {reservation.dateFiled || 'N/A'}
                  </span>
                </p>
                <p className="flex items-center justify-between font-mono text-[10px] pt-1 border-t border-gray-200">
                  <span className="text-gray-400">Created By UID:</span>
                  <span className="text-gray-600 truncate max-w-[180px]">
                    {reservation.createdByUid || 'N/A'}
                  </span>
                </p>
              </div>
            </div>

            {/* Venue & Time Info */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7A0808]">
                <MapPin size={15} />
                <span>Schedule & Venue</span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-700">
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Venue / Room:</span>
                  <span className="font-bold text-gray-900">
                    {reservation.designatedVenue || reservation.room || reservation.roomId || 'Unspecified'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Building:</span>
                  <span className="font-medium text-gray-800">
                    {reservation.building || reservation.buildingName || 'N/A'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Activity Date:</span>
                  <span className="font-bold text-[#7A0808]">
                    {reservation.dateOfActivity || 'N/A'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Time Slot:</span>
                  <span className="font-bold text-gray-900">
                    {reservation.timeStart && reservation.timeEnd
                      ? `${reservation.timeStart} – ${reservation.timeEnd}`
                      : 'N/A'}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-gray-400 font-medium">Participants:</span>
                  <span className="font-medium text-gray-800">
                    {reservation.participants || 0} attendees
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Objectives & Special Requirements */}
          {(reservation.objectives || reservation.specialRequirements) && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
              {reservation.objectives && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Activity Objectives</p>
                  <p className="text-xs text-gray-800 mt-0.5 whitespace-pre-wrap">{reservation.objectives}</p>
                </div>
              )}
              {reservation.specialRequirements && (
                <div className="pt-2 border-t border-gray-200/60">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Special Requirements / Equipment</p>
                  <p className="text-xs text-gray-800 mt-0.5 whitespace-pre-wrap">{reservation.specialRequirements}</p>
                </div>
              )}
            </div>
          )}

          {/* Approval Workflow Timeline */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <Layers size={14} className="text-[#7A0808]" />
                Approval Steps & History ({approvalRecords.length} steps)
              </h4>
            </div>

            {approvalRecords.length === 0 ? (
              <p className="text-xs text-gray-400 italic bg-gray-50 rounded-xl p-3 border border-gray-100">
                No approval workflow attached or initialized.
              </p>
            ) : (
              <div className="space-y-2">
                {approvalRecords.map((step, idx) => {
                  const stepStatus = (step.status || 'waiting').toLowerCase();
                  const isDone = stepStatus === 'approved';
                  const isPending = stepStatus === 'pending';
                  const isRejected = stepStatus === 'rejected';

                  return (
                    <div
                      key={step.id || idx}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        isDone
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isPending
                          ? 'bg-amber-50/50 border-amber-200'
                          : isRejected
                          ? 'bg-rose-50/50 border-rose-200'
                          : 'bg-gray-50/70 border-gray-200 opacity-75'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 mt-0.5 ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : isPending
                              ? 'bg-amber-500 text-white animate-pulse'
                              : isRejected
                              ? 'bg-rose-600 text-white'
                              : 'bg-gray-300 text-gray-700'
                          }`}
                        >
                          {step.levelNumber || idx + 1}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">
                            {step.roleLabel || step.roleId || 'Approver'}
                          </p>
                          <p className="text-[11px] text-gray-500 font-medium">
                            {step.approvedByName
                              ? `Reviewed by: ${step.approvedByName}`
                              : step.customManagerName
                              ? `Assigned Manager: ${step.customManagerName}`
                              : 'Pending assigned reviewer'}
                          </p>
                          {step.remarks && (
                            <p className="text-[11px] text-gray-600 mt-1 italic bg-white/70 px-2 py-1 rounded border border-gray-200">
                              Remarks: "{step.remarks}"
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        {step.signatureUrl && (
                          <div className="text-right">
                            <span className="text-[9px] font-bold text-gray-400 block uppercase">Signature</span>
                            <img
                              src={step.signatureUrl}
                              alt="Signature"
                              className="h-8 max-w-[90px] object-contain border border-gray-200 rounded bg-white p-0.5"
                            />
                          </div>
                        )}
                        <div className="text-right">
                          <span
                            className={`inline-block font-black text-[10px] uppercase px-2 py-0.5 rounded-full ${
                              isDone
                                ? 'bg-emerald-200 text-emerald-900'
                                : isPending
                                ? 'bg-amber-200 text-amber-900'
                                : isRejected
                                ? 'bg-rose-200 text-rose-900'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {step.status || 'Waiting'}
                          </span>
                          {step.approvedAt && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {new Date(step.approvedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Requestor Signature if present */}
          {reservation.signatureUrl && (
            <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Requestor Signature</p>
                <p className="text-xs text-gray-600 font-medium">Affixed on request creation</p>
              </div>
              <img
                src={reservation.signatureUrl}
                alt="Requestor Signature"
                className="h-10 max-w-[120px] object-contain border border-gray-200 rounded bg-white p-1"
              />
            </div>
          )}

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
                {JSON.stringify(reservation, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
          <button
            type="button"
            onClick={() => onDelete(reservation)}
            className="btn-delete text-xs py-2 px-3.5 gap-1.5 cursor-pointer flex items-center text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl font-bold transition-colors"
          >
            <Trash2 size={14} />
            <span>Delete Reservation</span>
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
