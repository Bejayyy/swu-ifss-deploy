import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { APPROVAL_TYPES } from '../../constants/approvalWorkflow';
import {
  formatRoleOptionLabel,
  subscribeAssignableRoles,
} from '../../services/roleService';
import CustomSelect from '../ui/CustomSelect';

export default function WorkflowLevelModal({
  onClose,
  onSave,
  initial = null,
  approvalType,
  nextLevelNumber = 1,
}) {
  const [roleOptions, setRoleOptions] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [form, setForm] = useState({
    approvalType: initial?.approvalType || approvalType || APPROVAL_TYPES.ACADEMIC,
    roleId: initial?.roleId || '',
    levelNumber: initial?.levelNumber || nextLevelNumber,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = subscribeAssignableRoles(
      (roles) => {
        setRoleOptions(roles);
        setRolesLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load roles from System Administration.');
        setRolesLoading(false);
      },
    );
    return unsub;
  }, []);

  const selectableRoles = useMemo(() => {
    let roles = [...roleOptions];
    
    // Always include special room-manager-dean option for dynamic dean management
    roles.push({
      value: 'room-manager-dean',
      label: 'Room Manager Dean',
      isSpecial: true,
    });
    
    if (!initial?.roleId) return roles;
    if (roles.some((role) => role.value === initial.roleId)) return roles;
    return [
      { value: initial.roleId, label: initial.roleLabel || initial.roleId, userCount: 0 },
      ...roles,
    ];
  }, [roleOptions, initial]);

  useEffect(() => {
    if (form.roleId || !selectableRoles.length) return;
    setForm((prev) => ({ ...prev, roleId: selectableRoles[0].value }));
  }, [selectableRoles, form.roleId]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.roleId) {
      setError('Select a role. Add users with that role in System Administration first.');
      return;
    }
    setBusy(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to save workflow level.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md relative p-8" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700">
          <X size={20} />
        </button>
        <h2 className="font-black text-lg mb-1" style={{ color: '#2B3235' }}>
          {initial ? 'Edit Workflow Level' : 'Add Workflow Level'}
        </h2>
        <p className="text-xs text-gray-500 mb-6">
          Roles are loaded from active users in System Administration (and active Registrar accounts).
        </p>
        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="form-label">Approval Type</label>
            <CustomSelect
              value={form.approvalType}
              onChange={(e) => setForm((f) => ({ ...f, approvalType: e.target.value }))}
              disabled={Boolean(initial) || Boolean(approvalType)}
              options={[
                { value: APPROVAL_TYPES.ACADEMIC, label: 'Academic' },
                { value: APPROVAL_TYPES.NON_ACADEMIC, label: 'Non-Academic' },
                { value: APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC, label: 'Dean-Managed Academic' },
                { value: APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC, label: 'Dean-Managed Non-Academic' },
              ]}
              placeholder="Select Approval Type"
            />
          </div>
          <div>
            <label className="form-label">Role</label>
            {rolesLoading ? (
              <p className="text-xs text-gray-400 py-2">Loading roles from System Administration…</p>
            ) : selectableRoles.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                No roles available yet. Add users in System Administration first.
              </p>
            ) : (
              <CustomSelect
                value={form.roleId}
                onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                options={selectableRoles.map((role) => ({
                  value: role.value,
                  label: formatRoleOptionLabel(role),
                }))}
                placeholder="Select Role"
              />
            )}
          </div>
          <div>
            <label className="form-label">Level</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={form.levelNumber}
              onChange={(e) => setForm((f) => ({ ...f, levelNumber: Number(e.target.value) }))}
              disabled={Boolean(initial)}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || rolesLoading || selectableRoles.length === 0}
              className="btn-maroon flex-1 justify-center py-2.5"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
