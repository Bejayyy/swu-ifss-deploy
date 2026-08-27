import React, { useState } from 'react';
import { X, Plus, Trash2, ShieldPlus } from 'lucide-react';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';
import { getAllCatalogNavKeys, getAllCatalogPermissionKeys } from '../../constants/accessCatalog';

const createEmptyRole = () => ({
  id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  key: '',
  label: '',
  permissions: [],
  navKeys: ['dashboard', 'approvals'],
  requiresCollege: false,
});

export default function AddRoleModal({ onClose, onSave, saving = false, existingRoles = [] }) {
  const [rolesList, setRolesList] = useState([createEmptyRole()]);
  const [error, setError] = useState('');

  const updateRoleField = (index, field, value) => {
    setRolesList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddRole = () => {
    setRolesList((prev) => [...prev, createEmptyRole()]);
  };

  const handleRemoveRole = (index) => {
    if (rolesList.length <= 1) return;
    setRolesList((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    const seenKeys = new Set();
    const seenLabels = new Set();
    const payloadList = [];

    for (let i = 0; i < rolesList.length; i++) {
      const r = rolesList[i];
      const numLabel = rolesList.length > 1 ? ` (Role #${i + 1})` : '';

      const key = r.key.trim().toLowerCase().replace(/\s+/g, '_');
      const label = r.label.trim();

      if (!key) {
        setError(`Role key is required${numLabel}.`);
        return;
      }
      if (!/^[a-z][a-z0-9_]*$/.test(key)) {
        setError(`Role key must start with a letter and use only lowercase letters, numbers, and underscores${numLabel}.`);
        return;
      }
      if (!label) {
        setError(`Display label is required${numLabel}.`);
        return;
      }

      if (seenKeys.has(key)) {
        setError(`Duplicate role key "${key}" in entry list${numLabel}.`);
        return;
      }
      if (seenLabels.has(label.toLowerCase())) {
        setError(`Duplicate role label "${label}" in entry list${numLabel}.`);
        return;
      }

      seenKeys.add(key);
      seenLabels.add(label.toLowerCase());

      if (Array.isArray(existingRoles) && existingRoles.length > 0) {
        const duplicate = existingRoles.find(
          (item) => (item.id || item.value || '').toLowerCase() === key || (item.label || '').toLowerCase() === label.toLowerCase()
        );
        if (duplicate) {
          setError(`A role "${duplicate.label || duplicate.id || key}" already exists in the system${numLabel}.`);
          return;
        }
      }

      payloadList.push({
        id: key,
        label,
        permissions: r.permissions,
        navKeys: r.navKeys,
        requiresCollege: Boolean(r.requiresCollege),
        isSystem: false,
      });
    }

    try {
      await onSave(payloadList.length === 1 ? payloadList[0] : payloadList);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create role(s).');
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
            <div className="flex items-center gap-2">
              <h2 className="font-black text-lg text-dark leading-tight">
                {rolesList.length > 1 ? `Add Custom Roles (${rolesList.length})` : 'Add Custom Role'}
              </h2>
              <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
                {rolesList.length} {rolesList.length === 1 ? 'role' : 'roles'}
              </span>
            </div>
            <p className="text-xs font-medium text-gray-500 mt-0.5">
              Create new roles and choose what navigation and actions their assigned users can access.
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
        <form id="addRoleForm" onSubmit={submit} className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
              {error}
            </p>
          )}

          <div className="space-y-6">
            {rolesList.map((form, index) => (
              <div
                key={form.id || index}
                className="bg-gray-50/70 border border-gray-200 rounded-2xl p-5 relative transition-all shadow-sm"
              >
                {rolesList.length > 1 && (
                  <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
                    <span className="text-xs font-black text-[#7A0808] uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldPlus size={14} /> Role #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRole(index)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                      title="Remove role"
                    >
                      <Trash2 size={15} />
                      <span>Remove</span>
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Role key <span className="text-red-500">*</span></label>
                      <input
                        className="form-input"
                        placeholder="e.g. guard"
                        value={form.key}
                        onChange={(e) => updateRoleField(index, 'key', e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label">Display label <span className="text-red-500">*</span></label>
                      <input
                        className="form-input"
                        placeholder="e.g. Security Guard"
                        value={form.label}
                        onChange={(e) => updateRoleField(index, 'label', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 p-3.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <input
                      type="checkbox"
                      id={`requiresCollegeAdd_${index}`}
                      className="accent-[#7A0808] w-4 h-4 rounded cursor-pointer"
                      checked={Boolean(form.requiresCollege)}
                      onChange={(e) => updateRoleField(index, 'requiresCollege', e.target.checked)}
                    />
                    <label htmlFor={`requiresCollegeAdd_${index}`} className="cursor-pointer text-xs font-bold text-dark">
                      Belongs / Assigned to a specific College
                      <span className="block text-[10px] font-normal text-gray-500 mt-0.5">
                        Check if users in this role belong to a specific College (e.g. Dean, Teacher). Leave unchecked for non-college roles (e.g. Guard, GSD).
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="form-label mb-0">Access & navigation permissions</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-[10px] font-bold px-2.5 py-1 rounded bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 transition-colors shadow-sm"
                        onClick={() => {
                          setRolesList((prev) => {
                            const updated = [...prev];
                            updated[index] = {
                              ...updated[index],
                              permissions: getAllCatalogPermissionKeys(),
                              navKeys: getAllCatalogNavKeys(),
                            };
                            return updated;
                          });
                        }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-bold px-2.5 py-1 rounded bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 transition-colors shadow-sm"
                        onClick={() => {
                          setRolesList((prev) => {
                            const updated = [...prev];
                            updated[index] = {
                              ...updated[index],
                              permissions: [],
                              navKeys: ['dashboard'],
                            };
                            return updated;
                          });
                        }}
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  <PermissionCheckboxGrid
                    permissions={form.permissions}
                    navKeys={form.navKeys}
                    onChange={({ permissions, navKeys }) => {
                      setRolesList((prev) => {
                        const updated = [...prev];
                        updated[index] = { ...updated[index], permissions, navKeys };
                        return updated;
                      });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Button to Add Another Role */}
          <button
            type="button"
            onClick={handleAddRole}
            className="w-full mt-2 py-3 border-2 border-dashed border-[#7A0808] text-[#7A0808] hover:bg-red-50/50 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={16} /> Add Another Role
          </button>
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
            form="addRoleForm"
            className="btn-maroon flex-1 justify-center py-2.5"
            disabled={saving}
          >
            {saving ? 'Saving...' : rolesList.length > 1 ? `Save ${rolesList.length} Roles` : 'Save Role'}
          </button>
        </div>
      </div>
    </div>
  );
}
