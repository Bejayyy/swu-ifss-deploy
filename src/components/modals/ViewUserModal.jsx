import React, { useEffect, useMemo, useState } from 'react';
import { X, Shield, Building2, KeyRound, CheckCircle2, XCircle, Pencil, Eye, Save } from 'lucide-react';
import { USER_STATUS, INSTITUTIONAL_EMAIL_DOMAIN } from '../../firebase/constants';
import { requiresCollege, formatCollegeName } from '../../constants/colleges';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';
import { getRoleDefinition } from '../../constants/rolePermissions';
import { subscribeColleges } from '../../services/collegeService';
import CustomSelect from '../ui/CustomSelect';

const R = 12;

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

export default function ViewUserModal({
  user,
  roleDefinitionsList = [],
  roleDefinitions = {},
  onClose,
  onSave,
  saving = false,
}) {
  if (!user) return null;

  const [isEditing, setIsEditing] = useState(true);
  const [colleges, setColleges] = useState([]);
  const [error, setError] = useState('');

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

  const computedFullName = useMemo(() => {
    const parts = [form.firstName, form.middleName, form.lastName].map((s) => s.trim()).filter(Boolean);
    return parts.join(' ') || user?.name || '';
  }, [form.firstName, form.middleName, form.lastName, user]);

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

  const handleSubmit = async (e) => {
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
      const saveData = {
        uid: user.uid,
        name: computedFullName,
        firstName: form.firstName.trim(),
        middleName: form.middleName ? form.middleName.trim() : '',
        lastName: form.lastName.trim(),
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
        className="bg-white w-full max-w-2xl shadow-2xl m-4 border border-gray-100 overflow-hidden rounded-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 flex items-center justify-center text-sm font-black text-white rounded-xl shadow-sm"
              style={{ background: '#7A0808' }}
            >
              {user.initials || 'U'}
            </div>
            <div>
              <h2 className="font-black text-base" style={{ color: '#2B3235' }}>
                {computedFullName || user.name}
              </h2>
              <p className="text-xs font-semibold text-gray-500">{form.email || user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                isEditing
                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isEditing ? <Eye size={14} /> : <Pencil size={14} />}
              <span>{isEditing ? 'View Details' : 'Edit Mode'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-200/60 transition-colors text-gray-500 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {!isEditing ? (
            /* VIEW MODE */
            <div className="space-y-4">
              {/* Account Status Badge */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                <span className="font-bold text-gray-600">Account Status</span>
                <span className="flex items-center gap-1.5 font-bold">
                  {form.status === USER_STATUS.ACTIVE || user.status === 'Active' ? (
                    <>
                      <CheckCircle2 size={15} className="text-emerald-500" />
                      <span className="text-emerald-700 font-bold">Active</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={15} className="text-red-500" />
                      <span className="text-red-700 font-bold">Inactive</span>
                    </>
                  )}
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-gray-100 bg-white">
                  <p className="font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                    <Shield size={14} className="text-[#7A0808]" /> Role
                  </p>
                  <p className="font-bold text-gray-800 text-sm">{user.role}</p>
                </div>

                <div className="p-3.5 rounded-xl border border-gray-100 bg-white">
                  <p className="font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                    <Building2 size={14} className="text-[#7A0808]" /> Department / College
                  </p>
                  <p className="font-bold text-gray-800 text-sm">{user.department || user.college || 'N/A'}</p>
                </div>
              </div>

              {/* Access Config */}
              <div className="p-3.5 rounded-xl border border-gray-100 bg-white">
                <p className="font-semibold text-gray-400 mb-1.5 flex items-center gap-1.5">
                  <KeyRound size={14} className="text-[#7A0808]" /> Navigation & Access Config
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-bold text-gray-800">
                    {user.useCustomAccess ? 'Custom Access (User Override)' : 'Role Default Access'}
                  </span>
                  <span className="font-bold px-2.5 py-1 rounded-md bg-gray-100 text-gray-700">
                    {user.permissions?.length || 0} permissions · {user.navKeys?.length || 0} nav items
                  </span>
                </div>
              </div>

              {user.permissions && user.permissions.length > 0 && (
                <div className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/50">
                  <p className="font-bold text-gray-700 mb-2">Granted Permissions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {user.permissions.map((p) => (
                      <span key={p} className="px-2 py-1 rounded-md bg-white border border-gray-200 font-semibold text-gray-700">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="btn-maroon gap-2 text-xs px-5 py-2.5 inline-flex items-center justify-center rounded-[10px]"
                >
                  <Pencil size={14} /> Edit User Details
                </button>
              </div>
            </div>
          ) : (
            /* EDIT MODE */
            <form id="edit-user-form" onSubmit={handleSubmit} className="space-y-4">
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
                    placeholder="e.g. Santos (Optional)"
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
                <label className="form-label">
                  Email <span className="text-red-500">*</span>
                </label>
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
                  </div>
                )}
              </div>

              <div>
                <label className="form-label">Account status</label>
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

              <div className="pt-2 border-t border-gray-100">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer mb-3" style={{ color: '#2B3235' }}>
                  <input
                    type="checkbox"
                    checked={form.useCustomAccess}
                    onChange={(e) => set('useCustomAccess', e.target.checked)}
                    className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808]"
                  />
                  Customize access for this user (override role defaults)
                </label>

                <div className={form.useCustomAccess ? '' : 'opacity-50 pointer-events-none'}>
                  <PermissionCheckboxGrid
                    permissions={form.permissions}
                    navKeys={form.navKeys}
                    onChange={({ permissions, navKeys }) => setForm((f) => ({ ...f, permissions, navKeys }))}
                    disabled={!form.useCustomAccess}
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline-maroon text-xs px-4 py-2"
            style={{ borderRadius: 10 }}
            disabled={saving}
          >
            Close
          </button>
          {isEditing && (
            <button
              type="submit"
              form="edit-user-form"
              className="btn-maroon text-xs px-5 py-2 flex items-center gap-1.5"
              style={{ borderRadius: 10 }}
              disabled={saving}
            >
              <Save size={14} />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
