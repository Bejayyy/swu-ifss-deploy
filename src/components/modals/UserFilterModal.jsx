import React, { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { STAFF_ROLE_OPTIONS } from '../../services/systemUserService';
import CustomSelect from '../ui/CustomSelect';

const R = 10;
const STATUSES = ['Any', 'Active', 'Inactive'];

export default function UserFilterModal({
  onClose,
  onApply,
  initialRole = 'Any',
  initialStatus = 'Any',
  roleOptions = [],
}) {
  const [role, setRole] = useState(initialRole);
  const [status, setStatus] = useState(initialStatus);

  const roles = useMemo(() => {
    const opts = roleOptions.length ? roleOptions : STAFF_ROLE_OPTIONS;
    return [{ value: 'Any', label: 'Any' }, ...opts.map((r) => ({ value: r.value, label: r.label }))];
  }, [roleOptions]);

  useEffect(() => {
    setRole(initialRole);
    setStatus(initialStatus);
  }, [initialRole, initialStatus]);

  const apply = () => {
    onApply({ role, status });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm shadow-xl m-4 border border-gray-100"
        style={{ borderRadius: R }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-base" style={{ color: '#2B3235' }}>Filter users</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100" style={{ borderRadius: R }}>
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="form-label">Role</label>
            <CustomSelect
              value={role}
              onChange={(e) => setRole(e.target.value)}
              options={roles}
              placeholder="Select Role"
            />
          </div>
          <div>
            <label className="form-label">Status</label>
            <CustomSelect
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={STATUSES}
              placeholder="Select Status"
            />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" style={{ borderRadius: R }} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-maroon flex-1 justify-center py-2.5" style={{ borderRadius: R }} onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
