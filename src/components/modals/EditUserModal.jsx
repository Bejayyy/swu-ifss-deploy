import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { USER_STATUS, INSTITUTIONAL_EMAIL_DOMAIN } from '../../firebase/constants';
import { requiresCollege, requiresDepartment } from '../../constants/colleges';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';
import { getRoleDefinition } from '../../constants/rolePermissions';
import { subscribeColleges } from '../../services/collegeService';

export default function EditUserModal({
  user,
  roleDefinitionsList = [],
  roleDefinitions = {},
  onClose,
  onSave,
  saving = false,
}) {
  const [colleges, setColleges] = useState([]);
  
  const roleOptions = useMemo(
    () => roleDefinitionsList.map((r) => ({ value: r.id, label: r.label || r.id })),
    [roleDefinitionsList],
  );

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    department: user?.department || '',
    college: user?.college || user?.department || '', // Initialize college from department for backward compatibility
    roleValue: user?.roleValue || roleOptions[0]?.value || 'dean',
    status: user?.status === 'Inactive' ? USER_STATUS.INACTIVE : USER_STATUS.ACTIVE,
    useCustomAccess: Boolean(user?.permissions?.length || user?.navKeys?.length),
    permissions: user?.permissions || [],
    navKeys: user?.navKeys || [],
  });
  const [error, setError] = useState('');

  // Subscribe to colleges from Firestore
  useEffect(() => {
    return subscribeColleges(
      (data) => setColleges(data),
      (err) => console.error('Error loading colleges:', err)
    );
  }, []);

  const showCollegeField = useMemo(
    () => requiresCollege(form.roleValue, roleDefinitions),
    [form.roleValue, roleDefinitions],
  );

  useEffect(() => {
    if (form.useCustomAccess) return;
    const def = getRoleDefinition(form.roleValue, roleDefinitions);
    setForm((f) => ({
      ...f,
      permissions: def.permissions || [],
      navKeys: def.navKeys || [],
    }));
  }, [form.roleValue, form.useCustomAccess, roleDefinitions]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!form.email.toLowerCase().endsWith(`@${INSTITUTIONAL_EMAIL_DOMAIN}`)) {
      setError(`Use school email ending in @${INSTITUTIONAL_EMAIL_DOMAIN}.`);
      return;
    }
    if (showCollegeField && !form.college) {
      setError('College is required for this role.');
      return;
    }
    try {
      const saveData = {
        uid: user.uid,
        name: form.name.trim(),
        email: form.email.trim(),
        department: showCollegeField ? form.college : '',
        college: showCollegeField ? form.college : '',
        roleValue: form.roleValue,
        status: form.status,
        permissions: form.useCustomAccess ? form.permissions : [],
        navKeys: form.useCustomAccess ? form.navKeys : [],
        useCustomAccess: form.useCustomAccess,
      };
      await onSave(saveData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update user.');
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
          <h2 className="font-black text-lg mb-1" style={{ color: '#7A0808' }}>Edit user access</h2>
          <p className="text-xs font-medium mb-4" style={{ color: '#2B3235', opacity: 0.65 }}>
            Update user information and access permissions
          </p>

          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Full name</label>
                <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder={`name@${INSTITUTIONAL_EMAIL_DOMAIN}`}
                  value={form.email} 
                  onChange={(e) => set('email', e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className={`grid grid-cols-1 ${showCollegeField ? 'sm:grid-cols-2' : ''} gap-4`}>
              <div>
                <label className="form-label">User role</label>
                <select 
                  className="form-input" 
                  value={form.roleValue} 
                  onChange={(e) => {
                    const newRole = e.target.value;
                    set('roleValue', newRole);
                    if (!requiresCollege(newRole, roleDefinitions)) {
                      set('college', '');
                      set('department', '');
                    }
                  }}
                >
                  {roleOptions.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

            {showCollegeField && (
              <div>
                <label className="form-label">College <span className="text-red-600">*</span></label>
                <select className="form-input" value={form.college} onChange={(e) => set('college', e.target.value)} required>
                  <option value="">Select College</option>
                  {colleges.map((college) => (
                    <option key={college.id} value={college.code}>
                      {college.name} ({college.code})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {colleges.length === 0 ? (
                    <span className="text-orange-600">⚠️ No colleges available. Add colleges in College Inventory first.</span>
                  ) : (
                    'This determines which college this user belongs to for scheduling and approvals'
                  )}
                </p>
              </div>
            )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option value={USER_STATUS.ACTIVE}>Active</option>
                  <option value={USER_STATUS.INACTIVE}>Inactive</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: '#2B3235' }}>
              <input
                type="checkbox"
                checked={form.useCustomAccess}
                onChange={(e) => set('useCustomAccess', e.target.checked)}
              />
              Customize access for this user (override role defaults)
            </label>

            <div className={form.useCustomAccess ? '' : 'opacity-50 pointer-events-none'}>
              <label className="form-label">Access & navigation</label>
              <PermissionCheckboxGrid
                permissions={form.permissions}
                navKeys={form.navKeys}
                onChange={({ permissions, navKeys }) => setForm((f) => ({ ...f, permissions, navKeys }))}
                disabled={!form.useCustomAccess}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-8">
            <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-maroon flex-1 justify-center py-2.5" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
