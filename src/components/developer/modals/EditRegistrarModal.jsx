import React, { useState } from 'react';
import { X } from 'lucide-react';
import { REGISTRAR_PERMISSION_CATALOG, USER_STATUS } from '../../../firebase/constants';
import CustomSelect from '../../ui/CustomSelect';
import { toTitleCase } from '../../../utils/excelTemplate';

export default function EditRegistrarModal({ registrar, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    displayName: registrar.displayName || '',
    department: registrar.department || '',
    phone: registrar.phone || '',
    status: registrar.status || USER_STATUS.ACTIVE,
    permissions: registrar.permissions || [],
  });
  const [error, setError] = useState('');
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const togglePermission = (id) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(id)
        ? f.permissions.filter((p) => p !== id)
        : [...f.permissions, id],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onSave({
        uid: registrar.uid,
        ...form,
        displayName: toTitleCase(form.displayName),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update registrar.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10">
          <X size={20} />
        </button>
        <form onSubmit={submit} className="p-8 pt-10">
          <h2 className="font-black text-lg mb-1" style={{ color: '#7A0808' }}>Edit Registrar</h2>
          <p className="text-xs text-gray-500 mb-4">{registrar.email}</p>
          {error && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="form-label">Full name</label>
              <input className="form-input" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Department</label>
                <input className="form-input" value={form.department} onChange={(e) => set('department', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="form-label">Status</label>
              <CustomSelect
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                options={[
                  { value: USER_STATUS.ACTIVE, label: 'Active' },
                  { value: USER_STATUS.INACTIVE, label: 'Inactive' },
                ]}
                placeholder="Select status"
              />
            </div>
            <div>
              <label className="form-label">Permissions</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-3">
                {REGISTRAR_PERMISSION_CATALOG.map((perm) => (
                  <label key={perm.id} className="flex items-start gap-2 text-xs font-medium cursor-pointer">
                    <input type="checkbox" checked={form.permissions.includes(perm.id)} onChange={() => togglePermission(perm.id)} className="mt-0.5" />
                    <span>{perm.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-8">
            <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="flex-1 justify-center py-2.5 rounded-[10px] text-white font-semibold text-sm disabled:opacity-60" style={{ background: '#7A0808' }} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
