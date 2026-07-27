import React, { useState } from 'react';
import { X } from 'lucide-react';
import { USER_STATUS } from '../../../firebase/constants';

export default function RegistrarFilterModal({ onClose, onApply, initialStatus = 'any' }) {
  const [status, setStatus] = useState(initialStatus);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl relative" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700">
          <X size={20} />
        </button>
        <div className="p-8 pt-10">
          <h2 className="font-black text-lg mb-4" style={{ color: '#800000' }}>Filter registrars</h2>
          <label className="form-label">Status</label>
          <select className="form-input mb-6" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="any">Any status</option>
            <option value={USER_STATUS.ACTIVE}>Active</option>
            <option value={USER_STATUS.INACTIVE}>Inactive</option>
          </select>
          <div className="flex gap-2">
            <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="flex-1 justify-center py-2.5 rounded-[10px] text-white font-semibold text-sm"
              style={{ background: '#800000' }}
              onClick={() => {
                onApply({ status });
                onClose();
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
