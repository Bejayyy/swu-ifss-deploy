import React, { useState } from 'react';
import { X } from 'lucide-react';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';

export default function RoleAccessModal({ role, onClose, onSave, saving = false }) {
  const [form, setForm] = useState({
    label: role?.label || '',
    permissions: role?.permissions || [],
    navKeys: role?.navKeys || [],
    requiresCollege: role?.requiresCollege ?? ['dean', 'teacher', 'organization_head'].includes(role?.id),
  });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.label.trim()) {
      setError('Role label is required.');
      return;
    }
    try {
      await onSave({
        id: role.id,
        label: form.label.trim(),
        permissions: form.permissions,
        navKeys: form.navKeys,
        requiresCollege: Boolean(form.requiresCollege),
        isSystem: role.isSystem,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save role.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10">
          <X size={20} />
        </button>
        <form onSubmit={submit} className="p-8 pt-10">
          <h2 className="font-black text-lg mb-1" style={{ color: '#7A0808' }}>
            Edit role access
          </h2>
          <p className="text-xs font-medium mb-4" style={{ color: '#2B3235', opacity: 0.65 }}>
            Configure navigation and permissions for the <span className="font-bold">{role?.label || role?.id}</span> role.
            {role?.isSystem && ' Built-in roles cannot be deleted.'}
          </p>

          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <div>
              <label className="form-label">Role label</label>
              <input
                className="form-input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                required
              />
              <p className="text-[10px] font-semibold mt-1 opacity-50">Role key: {role?.id}</p>
            </div>

            <div className="flex items-center gap-2.5 p-3.5 bg-gray-50 border border-gray-100 rounded-xl">
              <input
                type="checkbox"
                id="requiresCollegeEdit"
                className="accent-[#7A0808] w-4 h-4 rounded cursor-pointer"
                checked={Boolean(form.requiresCollege)}
                onChange={(e) => setForm((f) => ({ ...f, requiresCollege: e.target.checked }))}
              />
              <label htmlFor="requiresCollegeEdit" className="cursor-pointer text-xs font-bold text-[#2B3235]">
                Belongs / Assigned to a specific College
                <span className="block text-[10px] font-normal text-gray-500 mt-0.5">
                  If checked, users assigned this role must select a College (e.g. Dean, Teacher). If unchecked, College selection is hidden (e.g. Guard, GSD, Student Life).
                </span>
              </label>
            </div>

            <div>
              <label className="form-label">Access & navigation</label>
              <PermissionCheckboxGrid
                permissions={form.permissions}
                navKeys={form.navKeys}
                onChange={({ permissions, navKeys }) => setForm((f) => ({ ...f, permissions, navKeys }))}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-8">
            <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-maroon flex-1 justify-center py-2.5" disabled={saving}>
              {saving ? 'Saving…' : 'Save role access'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
