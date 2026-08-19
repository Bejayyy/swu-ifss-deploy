import React from 'react';
import { Power, X, Pencil } from 'lucide-react';
import { USER_STATUS } from '../../../firebase/constants';

export default function RegistrarActionsModal({
  registrar,
  onClose,
  onEdit,
  onToggleStatus,
  busy,
}) {
  const isActive = registrar.status === USER_STATUS.ACTIVE;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700">
          <X size={20} />
        </button>
        <div className="p-8 pt-10">
          <h2 className="font-black text-lg mb-1" style={{ color: '#7A0808' }}>{registrar.displayName}</h2>
          <p className="text-xs font-medium mb-6" style={{ color: '#2B3235', opacity: 0.65 }}>{registrar.email}</p>

          <div className="space-y-2">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-100 hover:bg-gray-50 text-sm font-semibold"
              onClick={() => { onClose(); onEdit(registrar); }}
              disabled={busy}
            >
              <Pencil size={16} /> Edit information
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-100 hover:bg-gray-50 text-sm font-semibold"
              onClick={() => onToggleStatus(registrar)}
              disabled={busy}
            >
              <Power size={16} /> {isActive ? 'Deactivate account' : 'Activate account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
