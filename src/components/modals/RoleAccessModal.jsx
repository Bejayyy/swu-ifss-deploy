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
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] shadow-xl relative flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Non-Scrollable Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white flex-shrink-0">
          <div>
            <h2 className="font-black text-lg text-dark leading-tight" style={{ color: '#7A0808' }}>
              Edit role access
            </h2>
            <p className="text-xs font-medium text-gray-500 mt-0.5">
              Configure navigation and permissions for the <span className="font-bold text-gray-800">{role?.label || role?.id}</span> role.
              {role?.isSystem && ' Built-in roles cannot be deleted.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form id="roleAccessForm" onSubmit={submit} className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
              {error}
            </p>
          )}

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
        </form>

        {/* Fixed Non-Scrollable Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            className="btn-outline-maroon flex-1 justify-center py-2.5"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="roleAccessForm"
            className="btn-maroon flex-1 justify-center py-2.5"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save role access'}
          </button>
        </div>
      </div>
    </div>
  );
}
