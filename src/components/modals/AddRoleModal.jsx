import React, { useState } from 'react';
import { X } from 'lucide-react';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';
import { getAllCatalogNavKeys, getAllCatalogPermissionKeys } from '../../constants/accessCatalog';

export default function AddRoleModal({ onClose, onSave, saving = false, existingRoles = [] }) {
  const [form, setForm] = useState({
    key: '',
    label: '',
    permissions: [],
    navKeys: ['dashboard', 'approvals'],
    requiresCollege: false,
  });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const key = form.key.trim().toLowerCase().replace(/\s+/g, '_');
    const label = form.label.trim();

    if (!key) {
      setError('Role key is required.');
      return;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setError('Role key must start with a letter and use only lowercase letters, numbers, and underscores.');
      return;
    }
    if (!label) {
      setError('Role label is required.');
      return;
    }

    if (Array.isArray(existingRoles) && existingRoles.length > 0) {
      const duplicate = existingRoles.find(
        (r) => (r.id || r.value || '').toLowerCase() === key || (r.label || '').toLowerCase() === label.toLowerCase()
      );
      if (duplicate) {
        setError(`A role "${duplicate.label || duplicate.id || key}" already exists in the system.`);
        return;
      }
    }

    try {
      await onSave({
        id: key,
        label,
        permissions: form.permissions,
        navKeys: form.navKeys,
        requiresCollege: Boolean(form.requiresCollege),
        isSystem: false,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create role.');
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
          <h2 className="font-black text-lg mb-1" style={{ color: '#7A0808' }}>Add custom role</h2>
          <p className="text-xs font-medium mb-4" style={{ color: '#2B3235', opacity: 0.65 }}>
            Create a new role and choose what navigation and actions its users can access.
          </p>

          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Role key</label>
                <input
                  className="form-input"
                  placeholder="e.g. guard"
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="form-label">Display label</label>
                <input
                  className="form-input"
                  placeholder="e.g. Security Guard"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3.5 bg-gray-50 border border-gray-100 rounded-xl">
              <input
                type="checkbox"
                id="requiresCollegeAdd"
                className="accent-[#7A0808] w-4 h-4 rounded cursor-pointer"
                checked={Boolean(form.requiresCollege)}
                onChange={(e) => setForm((f) => ({ ...f, requiresCollege: e.target.checked }))}
              />
              <label htmlFor="requiresCollegeAdd" className="cursor-pointer text-xs font-bold text-[#2B3235]">
                Belongs / Assigned to a specific College
                <span className="block text-[10px] font-normal text-gray-500 mt-0.5">
                  Check this if users in this role belong to a specific College (e.g. Dean, Teacher). Leave unchecked for non-college roles (e.g. Guard, GSD).
                </span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-[10px] font-bold px-2 py-1 rounded border border-gray-200"
                onClick={() => setForm((f) => ({
                  ...f,
                  permissions: getAllCatalogPermissionKeys(),
                  navKeys: getAllCatalogNavKeys(),
                }))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-[10px] font-bold px-2 py-1 rounded border border-gray-200"
                onClick={() => setForm((f) => ({ ...f, permissions: [], navKeys: ['dashboard'] }))}
              >
                Clear all
              </button>
            </div>

            <PermissionCheckboxGrid
              permissions={form.permissions}
              navKeys={form.navKeys}
              onChange={({ permissions, navKeys }) => setForm((f) => ({ ...f, permissions, navKeys }))}
            />
          </div>

          <div className="flex gap-2 mt-8">
            <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-maroon flex-1 justify-center py-2.5" disabled={saving}>
              {saving ? 'Creating…' : 'Create role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
