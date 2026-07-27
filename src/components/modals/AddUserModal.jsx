import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';
import { INSTITUTIONAL_EMAIL_DOMAIN } from '../../firebase/constants';
import { requiresCollege, requiresDepartment } from '../../constants/colleges';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';
import { getRoleDefinition } from '../../constants/rolePermissions';
import { subscribeColleges } from '../../services/collegeService';
import AddRoleModal from './AddRoleModal';
import AddCollegeModal from './AddCollegeModal';

export default function AddUserModal({
  onClose,
  onSave,
  roleOptions = [],
  roleDefinitions = {},
  roleDefinitionsList = [],
  onSaveRole,
}) {
  const [colleges, setColleges] = useState([]);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [showAddCollegeModal, setShowAddCollegeModal] = useState(false);

  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    department: '',
    college: '',
    role: roleOptions[0]?.value || 'dean',
    useCustomAccess: false,
    permissions: [],
    navKeys: [],
  });
  const [error, setError] = useState('');

  // Subscribe to colleges from Firestore
  useEffect(() => {
    return subscribeColleges(
      (data) => setColleges(data),
      (err) => console.error('Error loading colleges:', err)
    );
  }, []);

  useEffect(() => {
    if (form.useCustomAccess) return;
    const def = getRoleDefinition(form.role, roleDefinitions);
    setForm((f) => ({
      ...f,
      permissions: def.permissions || [],
      navKeys: def.navKeys || [],
    }));
  }, [form.role, form.useCustomAccess, roleDefinitions]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const showCollegeField = useMemo(() => requiresCollege(form.role, roleDefinitions), [form.role, roleDefinitions]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.firstName.trim()) {
      setError('First Name is required.');
      return;
    }
    if (!form.middleName.trim()) {
      setError('Middle Name is required.');
      return;
    }
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

    const fullName = `${form.firstName.trim()} ${form.middleName.trim()} ${form.lastName.trim()}`;

    try {
      const saveData = {
        ...form,
        name: fullName,
        college: showCollegeField ? form.college : '',
        department: showCollegeField ? form.college : '',
        permissions: form.useCustomAccess ? form.permissions : [],
        navKeys: form.useCustomAccess ? form.navKeys : [],
      };
      await onSave(saveData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add user.');
    }
  };

  const roles = useMemo(
    () => (roleOptions.length ? roleOptions : [{ value: 'dean', label: 'Dean' }]),
    [roleOptions],
  );

  const handleRoleCreated = async (rolePayload) => {
    if (onSaveRole) {
      const newRoleKey = await onSaveRole(rolePayload);
      if (newRoleKey) {
        set('role', newRoleKey);
      }
    }
    setShowAddRoleModal(false);
  };

  const handleCollegeCreated = (newCollegeCode) => {
    if (newCollegeCode) {
      set('college', newCollegeCode);
    }
    setShowAddCollegeModal(false);
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10">
            <X size={20} />
          </button>
          <form onSubmit={submit} className="p-8 pt-10">
            <h2 className="font-black text-lg mb-1" style={{ color: '#2B3235' }}>Add user</h2>
            <p className="text-xs font-medium mb-6" style={{ color: '#2B3235', opacity: 0.65 }}>
              Create a new user account with role-based access
            </p>
            {error && <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>}
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
                    required
                  />
                </div>
                <div>
                  <label className="form-label">
                    Middle Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="form-input"
                    value={form.middleName}
                    onChange={(e) => set('middleName', e.target.value)}
                    required
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

              {/* User Role & College Selection */}
              <div className={`grid grid-cols-1 ${showCollegeField ? 'sm:grid-cols-2' : ''} gap-3`}>
                <div>
                  <label className="form-label">
                    User role <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <select
                      className="form-input w-full pr-16 appearance-none bg-white cursor-pointer"
                      value={form.role}
                      onChange={(e) => {
                        const newRole = e.target.value;
                        set('role', newRole);
                        if (!requiresCollege(newRole, roleDefinitions)) set('college', '');
                      }}
                      required
                    >
                      {roles.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                      <button
                        type="button"
                        onClick={() => setShowAddRoleModal(true)}
                        className="w-6 h-6 rounded-md hover:bg-red-50 flex items-center justify-center text-[#7A0808] transition-colors border border-gray-200 pointer-events-auto bg-white shadow-sm"
                        title="Add New Role"
                      >
                        <Plus size={14} />
                      </button>
                      <ChevronDown size={14} className="text-gray-400" />
                    </div>
                  </div>
                </div>

                {showCollegeField && (
                  <div>
                    <label className="form-label">
                      College <span className="text-red-500">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <select
                        className="form-input w-full pr-16 appearance-none bg-white cursor-pointer"
                        value={form.college}
                        onChange={(e) => set('college', e.target.value)}
                        required
                      >
                        <option value="">Select College</option>
                        {colleges.map((c) => (
                          <option key={c.id} value={c.code}>
                            {c.name} ({c.code})
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                        <button
                          type="button"
                          onClick={() => setShowAddCollegeModal(true)}
                          className="w-6 h-6 rounded-md hover:bg-red-50 flex items-center justify-center text-[#7A0808] transition-colors border border-gray-200 pointer-events-auto bg-white shadow-sm"
                          title="Add New College"
                        >
                          <Plus size={14} />
                        </button>
                        <ChevronDown size={14} className="text-gray-400" />
                      </div>
                    </div>
                  </div>
                )}
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
              <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-maroon flex-1 justify-center py-2.5">
                Save user
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Nested Add Role Modal */}
      {showAddRoleModal && (
        <AddRoleModal
          onClose={() => setShowAddRoleModal(false)}
          onSave={handleRoleCreated}
          existingRoles={roleDefinitionsList}
        />
      )}

      {/* Nested Add College Modal */}
      {showAddCollegeModal && (
        <AddCollegeModal
          onClose={() => setShowAddCollegeModal(false)}
          onSaveSuccess={handleCollegeCreated}
          colleges={colleges}
        />
      )}
    </>
  );
}
