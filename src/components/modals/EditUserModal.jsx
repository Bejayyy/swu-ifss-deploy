import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { USER_STATUS, INSTITUTIONAL_EMAIL_DOMAIN } from '../../firebase/constants';
import { requiresCollege, requiresDepartment, formatCollegeName } from '../../constants/colleges';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';
import { getRoleDefinition } from '../../constants/rolePermissions';
import { subscribeColleges } from '../../services/collegeService';
import CustomSelect from '../ui/CustomSelect';
import { toTitleCase } from '../../utils/excelTemplate';

const parseFullName = (nameStr = '') => {
  const parts = nameStr.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
};

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

  const initialNames = useMemo(() => {
    if (user?.firstName || user?.lastName) {
      return {
        firstName: user?.firstName || '',
        middleName: user?.middleName || '',
        lastName: user?.lastName || '',
      };
    }
    return parseFullName(user?.name || '');
  }, [user]);

  const [form, setForm] = useState({
    firstName: initialNames.firstName,
    middleName: initialNames.middleName,
    lastName: initialNames.lastName,
    email: user?.email || '',
    department: user?.department || '',
    college: user?.college || user?.department || '',
    roleValue: user?.roleValue || roleOptions[0]?.value || 'dean',
    status: user?.status === 'Inactive' ? USER_STATUS.INACTIVE : USER_STATUS.ACTIVE,
    useCustomAccess: Boolean(user?.permissions?.length || user?.navKeys?.length),
    permissions: user?.permissions || [],
    navKeys: user?.navKeys || [],
  });
  const [error, setError] = useState('');

  const computedFullName = useMemo(() => {
    const parts = [form.firstName, form.middleName, form.lastName].map((s) => s.trim()).filter(Boolean);
    return parts.join(' ') || user?.name || '';
  }, [form.firstName, form.middleName, form.lastName, user]);

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
    if (!form.firstName.trim()) {
      setError('First Name is required.');
      return;
    }
    // Middle name is optional
    if (!form.lastName.trim()) {
      setError('Last Name is required.');
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
      const fn = toTitleCase(form.firstName);
      const mn = form.middleName?.trim() ? toTitleCase(form.middleName) : '';
      const ln = toTitleCase(form.lastName);
      const fullName = [fn, mn, ln].filter(Boolean).join(' ');

      const saveData = {
        uid: user.uid,
        name: fullName,
        firstName: fn,
        middleName: mn,
        lastName: ln,
        email: form.email.trim(),
        department: showCollegeField ? formatCollegeName(form.college) : '',
        college: showCollegeField ? formatCollegeName(form.college) : '',
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
            {/* First Name, Middle Name, Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="form-label">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="form-input"
                  value={form.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  placeholder="e.g. John"
                  required
                />
              </div>
              <div>
                <label className="form-label">
                  Middle Name <span className="text-gray-400 font-normal text-xs">(Optional)</span>
                </label>
                <input
                  className="form-input"
                  value={form.middleName}
                  onChange={(e) => set('middleName', e.target.value)}
                  placeholder="e.g. Santos"
                />
              </div>
              <div>
                <label className="form-label">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="form-input"
                  value={form.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  placeholder="e.g. Doe"
                  required
                />
              </div>
            </div>

            {/* Email */}
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

            <div className={`grid grid-cols-1 ${showCollegeField ? 'sm:grid-cols-2' : ''} gap-4`}>
              <div>
                <label className="form-label">User role</label>
                <CustomSelect
                  value={form.roleValue}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    set('roleValue', newRole);
                    if (!requiresCollege(newRole, roleDefinitions)) {
                      set('college', '');
                      set('department', '');
                    }
                  }}
                  options={roleOptions}
                  placeholder="Select Role"
                />
              </div>

            {showCollegeField && (
              <div>
                <label className="form-label">College <span className="text-red-600">*</span></label>
                <CustomSelect
                  value={form.college}
                  onChange={(e) => set('college', e.target.value)}
                  options={colleges.map((college) => ({
                    value: college.code,
                    label: `${college.name} (${college.code})`,
                  }))}
                  placeholder="Select College"
                  required
                />
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
                <CustomSelect
                  value={form.status}
                  onChange={(e) => set('status', e.target.value)}
                  options={[
                    { value: USER_STATUS.ACTIVE, label: 'Active' },
                    { value: USER_STATUS.INACTIVE, label: 'Inactive' },
                  ]}
                  placeholder="Select Status"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: '#2B3235' }}>
                <input
                  type="checkbox"
                  checked={form.useCustomAccess}
                  onChange={(e) => set('useCustomAccess', e.target.checked)}
                />
                Customize access for this user (override role defaults)
              </label>

              <div>
                <PermissionCheckboxGrid
                  permissions={form.permissions}
                  navKeys={form.navKeys}
                  roleLabel={roleOptions.find((r) => r.value === form.roleValue)?.label || form.roleValue}
                  onChange={({ permissions, navKeys }) => setForm((f) => ({ ...f, permissions, navKeys }))}
                  disabled={!form.useCustomAccess}
                />
              </div>
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
