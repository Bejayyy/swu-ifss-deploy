import React from 'react';
import { CheckCircle, Clock, XCircle, MinusCircle } from 'lucide-react';
import { APPROVAL_RECORD_STATUS } from '../../constants/approvalWorkflow';

function formatTimestamp(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function stepIcon(status) {
  if (status === APPROVAL_RECORD_STATUS.APPROVED) {
    return <CheckCircle size={14} className="text-white" />;
  }
  if (status === APPROVAL_RECORD_STATUS.REJECTED) {
    return <XCircle size={14} className="text-white" />;
  }
  if (status === APPROVAL_RECORD_STATUS.PENDING) {
    return <Clock size={14} className="text-white" />;
  }
  return <MinusCircle size={14} className="text-white" />;
}

function stepColor(status) {
  if (status === APPROVAL_RECORD_STATUS.APPROVED) return 'bg-[#7A0808]';
  if (status === APPROVAL_RECORD_STATUS.REJECTED) return 'bg-red-500';
  if (status === APPROVAL_RECORD_STATUS.PENDING) return 'bg-yellow-400';
  return 'bg-gray-200';
}

function statusLabel(status) {
  if (status === APPROVAL_RECORD_STATUS.APPROVED) return 'Approved';
  if (status === APPROVAL_RECORD_STATUS.REJECTED) return 'Rejected';
  if (status === APPROVAL_RECORD_STATUS.PENDING) return 'Waiting for Approval';
  if (status === APPROVAL_RECORD_STATUS.CANCELLED || status === APPROVAL_RECORD_STATUS.SKIPPED) {
    return 'Skipped';
  }
  return 'Waiting';
}

export default function ApprovalTimeline({ approvalRecords = [], compact = false }) {
  if (!approvalRecords.length) {
    return <p className="text-xs text-gray-400">No approval workflow configured.</p>;
  }

  return (
    <div className="space-y-3">
      {approvalRecords.map((record, index) => (
        <div key={record.id || `${record.levelNumber}-${record.roleId}`}>
          <div className="flex gap-3 items-start">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${stepColor(record.status)}`}>
              {stepIcon(record.status)}
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-dark">{record.roleLabel || record.roleId}</p>
              <p className="text-[10px] text-gray-400">
                {record.status === APPROVAL_RECORD_STATUS.APPROVED && record.approvedByName
                  ? `${record.approvedByName} · ${formatTimestamp(record.approvedAt) || 'Approved'}`
                  : statusLabel(record.status)}
              </p>
              {!compact && record.remarks && (
                <p className="text-[10px] text-gray-500 mt-1 italic">{record.remarks}</p>
              )}
            </div>
          </div>
          {index < approvalRecords.length - 1 && (
            <div className="ml-3 pl-3 border-l border-dashed border-gray-200 h-3" />
          )}
        </div>
      ))}
    </div>
  );
}
