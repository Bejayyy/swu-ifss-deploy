import React, { useState } from 'react';
import {
  X,
  User,
  Mail,
  Shield,
  Building,
  GraduationCap,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Key,
  Layers,
  Trash2,
  Code,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getInitials } from '../../../firebase/authHelpers';

export default function DeveloperUserDetailsModal({
  user,
  onClose,
  onDelete,
  currentUid,
}) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!user) return null;

  const isActive = (user.status || '').toLowerCase() === 'active';
  const role = user.role || user.roleValue || 'User';
  const isSelf = user.uid === currentUid || user.id === currentUid;
  const initials = user.initials || getInitials(user.displayName || user.name, user.email);

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
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 flex items-center justify-center text-sm font-black text-white rounded-xl shadow-xs flex-shrink-0"
              style={{ background: '#7A0808' }}
            >
              {initials}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-bold text-xs bg-[#FFF0F0] text-[#7A0808] border border-[#FFD0D0] px-2.5 py-0.5 rounded-full uppercase">
                  {role}
                </span>

                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                    isActive
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {isActive ? 'Active' : 'Inactive'}
                </span>

                {isSelf && (
                  <span className="text-[10px] font-black uppercase bg-purple-100 text-purple-900 border border-purple-200 px-2 py-0.5 rounded-full">
                    Your Account
                  </span>
                )}
              </div>

              <h3 className="font-black text-xl text-gray-900 leading-tight">
                {user.displayName || user.name || 'Unnamed User'}
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                {user.email || 'No email provided'}
              </p>
            </div>
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
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7A0808]">
              <User size={15} />
              <span>Account & Department Profile</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-400 font-medium">Full Name:</p>
                <p className="font-bold text-gray-900">{user.displayName || user.name || '—'}</p>
              </div>

              <div>
                <p className="text-gray-400 font-medium">Institutional Email:</p>
                <p className="font-bold text-gray-900 truncate">{user.email || '—'}</p>
              </div>

              <div>
                <p className="text-gray-400 font-medium">Department / Org:</p>
                <p className="font-bold text-gray-800">{user.department || '—'}</p>
              </div>

              <div>
                <p className="text-gray-400 font-medium">College:</p>
                <p className="font-bold text-gray-800">{user.college || '—'}</p>
              </div>

              <div>
                <p className="text-gray-400 font-medium">Last Login:</p>
                <p className="font-medium text-gray-700">
                  {user.lastLoginAt?.toDate
                    ? user.lastLoginAt.toDate().toLocaleString()
                    : user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString()
                    : 'Never'}
                </p>
              </div>

              <div>
                <p className="text-gray-400 font-medium">Created At:</p>
                <p className="font-medium text-gray-700">
                  {user.createdAt?.toDate
                    ? user.createdAt.toDate().toLocaleDateString()
                    : user.createdAt?.seconds
                    ? new Date(user.createdAt.seconds * 1000).toLocaleDateString()
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Permissions & Navigation Keys */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7A0808]">
              <Key size={15} />
              <span>Assigned Permissions ({(user.permissions || []).length})</span>
            </div>

            {(user.permissions || []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {user.permissions.map((perm) => (
                  <span
                    key={perm}
                    className="text-[11px] font-mono font-semibold bg-white border border-gray-200 text-gray-800 px-2 py-0.5 rounded-md"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">No specific granular permissions assigned.</p>
            )}
          </div>

          {/* UID & Document Identifiers */}
          <div className="bg-gray-50/60 rounded-xl p-3.5 border border-gray-100 text-xs space-y-1 font-mono text-gray-600">
            <p className="flex items-center justify-between">
              <span className="text-gray-400 font-sans">User UID:</span>
              <span className="text-gray-800 truncate max-w-[280px]">{user.uid || user.id}</span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-gray-400 font-sans">Auth Status:</span>
              <span className="text-gray-800">{user.mustSetPassword ? 'Password setup pending' : 'Configured'}</span>
            </p>
          </div>

          {/* Raw JSON Developer Toggle */}
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowRawJson((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              <Code size={13} />
              <span>{showRawJson ? 'Hide Raw Firestore Document' : 'View Raw Firestore Document (JSON)'}</span>
              {showRawJson ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showRawJson && (
              <pre className="mt-2 p-3 bg-gray-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-60">
                {JSON.stringify(user, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
          {!isSelf ? (
            <button
              type="button"
              onClick={() => onDelete(user)}
              className="btn-delete text-xs py-2 px-3.5 gap-1.5 cursor-pointer flex items-center text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl font-bold transition-colors"
            >
              <Trash2 size={14} />
              <span>Delete User Account</span>
            </button>
          ) : (
            <span className="text-xs text-gray-400 italic">Self-deletion is disabled for safety.</span>
          )}

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
