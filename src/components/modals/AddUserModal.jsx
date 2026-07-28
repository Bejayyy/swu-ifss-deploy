import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, ChevronDown, Trash2, UserPlus } from 'lucide-react';
import { INSTITUTIONAL_EMAIL_DOMAIN } from '../../firebase/constants';
import { requiresCollege, requiresDepartment } from '../../constants/colleges';
import PermissionCheckboxGrid from '../admin/PermissionCheckboxGrid';
import { getRoleDefinition } from '../../constants/rolePermissions';
import { subscribeColleges } from '../../services/collegeService';
import AddRoleModal from './AddRoleModal';
import AddCollegeModal from './AddCollegeModal';

const createEmptyUser = (defaultRole = 'dean', roleDefinitions = {}) => {
  const def = getRoleDefinition(defaultRole, roleDefinitions);
  return {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    department: '',
    college: '',
    role: defaultRole,
    useCustomAccess: false,
    permissions: def.permissions || [],
    navKeys: def.navKeys || [],
  };
};

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
  const [activeRoleModalUserIndex, setActiveRoleModalUserIndex] = useState(null);
  const [activeCollegeModalUserIndex, setActiveCollegeModalUserIndex] = useState(null);

  const defaultRole = roleOptions[0]?.value || 'dean';

  const [usersList, setUsersList] = useState([
    createEmptyUser(defaultRole, roleDefinitions),
  ]);
  const [error, setError] = useState('');

  // Subscribe to colleges from Firestore
  useEffect(() => {
    return subscribeColleges(
      (data) => setColleges(data),
      (err) => console.error('Error loading colleges:', err)
    );
  }, []);

  const roles = useMemo(
    () => (roleOptions.length ? roleOptions : [{ value: 'dean', label: 'Dean' }]),
    [roleOptions],
  );

  const updateUserField = (index, field, value) => {
    setUsersList((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };

      if (field === 'role') {
        const showCollege = requiresCollege(value, roleDefinitions);
        if (!showCollege) {
          target.college = '';
          target.department = '';
        }
        if (!target.useCustomAccess) {
          const def = getRoleDefinition(value, roleDefinitions);
          target.permissions = def.permissions || [];
          target.navKeys = def.navKeys || [];
        }
      } else if (field === 'useCustomAccess') {
        if (!value) {
          const def = getRoleDefinition(target.role, roleDefinitions);
          target.permissions = def.permissions || [];
          target.navKeys = def.navKeys || [];
        }
      }

      updated[index] = target;
      return updated;
    });
  };

  const handleAddPerson = () => {
    const lastUserRole = usersList[usersList.length - 1]?.role || defaultRole;
    setUsersList((prev) => [
      ...prev,
      createEmptyUser(lastUserRole, roleDefinitions),
    ]);
  };

  const handleRemovePerson = (index) => {
    if (usersList.length <= 1) return;
    setUsersList((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate each user entry
    const seenEmails = new Set();
    const payload = [];

    for (let i = 0; i < usersList.length; i++) {
      const u = usersList[i];
      const numLabel = usersList.length > 1 ? ` (Person #${i + 1})` : '';

      if (!u.firstName.trim()) {
        setError(`First Name is required${numLabel}.`);
        return;
      }
      if (!u.middleName.trim()) {
        setError(`Middle Name is required${numLabel}.`);
        return;
      }
      if (!u.lastName.trim()) {
        setError(`Last Name is required${numLabel}.`);
        return;
      }
      if (!u.email.trim()) {
        setError(`Email is required${numLabel}.`);
        return;
      }

      const normEmail = u.email.trim().toLowerCase();
      if (!normEmail.endsWith(`@${INSTITUTIONAL_EMAIL_DOMAIN}`)) {
        setError(`Use school email ending in @${INSTITUTIONAL_EMAIL_DOMAIN}${numLabel}.`);
        return;
      }

      if (seenEmails.has(normEmail)) {
        setError(`Duplicate email "${normEmail}" in entry list${numLabel}. Please use unique emails.`);
        return;
      }
      seenEmails.add(normEmail);

      const showCollege = requiresCollege(u.role, roleDefinitions);
      if (showCollege && !u.college) {
        setError(`College selection is required for ${u.role.toUpperCase()} role${numLabel}.`);
        return;
      }

      const fullName = `${u.firstName.trim()} ${u.middleName.trim()} ${u.lastName.trim()}`;

      payload.push({
        ...u,
        email: normEmail,
        name: fullName,
        college: showCollege ? u.college : '',
        department: showCollege ? u.college : '',
        permissions: u.useCustomAccess ? u.permissions : [],
        navKeys: u.useCustomAccess ? u.navKeys : [],
      });
    }

    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add user(s).');
    }
  };

  const handleRoleCreated = async (rolePayload) => {
    if (onSaveRole) {
      const newRoleKey = await onSaveRole(rolePayload);
      if (newRoleKey && activeRoleModalUserIndex !== null) {
        updateUserField(activeRoleModalUserIndex, 'role', newRoleKey);
      }
    }
    setShowAddRoleModal(false);
    setActiveRoleModalUserIndex(null);
  };

  const handleCollegeCreated = (newCollegeCode) => {
    if (newCollegeCode && activeCollegeModalUserIndex !== null) {
      updateUserField(activeCollegeModalUserIndex, 'college', newCollegeCode);
    }
    setShowAddCollegeModal(false);
    setActiveCollegeModalUserIndex(null);
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={onClose} className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 z-10 p-1 rounded-full hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
          <form onSubmit={submit} className="p-8 pt-10">
            <div className="flex items-center justify-between mb-1 pr-6">
              <h2 className="font-black text-lg text-dark">
                {usersList.length > 1 ? `Add Users (${usersList.length})` : 'Add User'}
              </h2>
              <span className="text-xs font-bold text-gray-600 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                {usersList.length} {usersList.length === 1 ? 'person' : 'people'}
              </span>
            </div>
            <p className="text-xs font-medium mb-4 text-gray-500">
              Create user accounts with role-based access. Invitation emails with temporary credentials will be sent automatically.
            </p>

            <div className="bg-amber-50/80 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs mb-5 flex items-start gap-2">
              <span className="font-bold flex-shrink-0">🔑 Temporary Password:</span>
              <span>An automatically generated temporary password will be included in the welcome email sent to each user upon account creation.</span>
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5 mb-5">
                {error}
              </p>
            )}

            <div className="space-y-6">
              {usersList.map((form, index) => {
                const showCollegeField = requiresCollege(form.role, roleDefinitions);

                return (
                  <div
                    key={form.id || index}
                    className="bg-gray-50/70 border border-gray-200 rounded-2xl p-5 relative transition-all shadow-sm"
                  >
                    {usersList.length > 1 && (
                      <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
                        <span className="text-xs font-black text-[#7A0808] uppercase tracking-wider flex items-center gap-1.5">
                          <UserPlus size={14} /> Person #{index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePerson(index)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                          title="Remove person"
                        >
                          <Trash2 size={15} />
                          <span>Remove</span>
                        </button>
                      </div>
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
                            onChange={(e) => updateUserField(index, 'firstName', e.target.value)}
                            placeholder="e.g. John"
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
                            onChange={(e) => updateUserField(index, 'middleName', e.target.value)}
                            placeholder="e.g. Santos"
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
                            onChange={(e) => updateUserField(index, 'lastName', e.target.value)}
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
                          onChange={(e) => updateUserField(index, 'email', e.target.value)}
                          required
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                          🔑 Note: An automatically generated temporary password will be included in the welcome email sent to this address.
                        </p>
                      </div>

                      {/* User Role & College Selection */}
                      <div className={`grid grid-cols-1 ${showCollegeField ? 'sm:grid-cols-2' : ''} gap-3`}>
                        <div>
                          <label className="form-label">
                            User Role <span className="text-red-500">*</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <select
                                className="form-input w-full pr-8 appearance-none bg-white cursor-pointer"
                                value={form.role}
                                onChange={(e) => updateUserField(index, 'role', e.target.value)}
                                required
                              >
                                {roles.map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveRoleModalUserIndex(index);
                                setShowAddRoleModal(true);
                              }}
                              className="h-[38px] w-[38px] rounded-lg border border-gray-200 bg-white hover:bg-red-50 text-[#7A0808] hover:border-red-200 flex items-center justify-center transition-colors shadow-sm flex-shrink-0"
                              title="Add New Role"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>

                        {showCollegeField && (
                          <div>
                            <label className="form-label">
                              College <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <select
                                  className="form-input w-full pr-8 appearance-none bg-white cursor-pointer"
                                  value={form.college}
                                  onChange={(e) => updateUserField(index, 'college', e.target.value)}
                                  required
                                >
                                  <option value="">Select College</option>
                                  {colleges.map((c) => (
                                    <option key={c.id} value={c.code}>
                                      {c.name} ({c.code})
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveCollegeModalUserIndex(index);
                                  setShowAddCollegeModal(true);
                                }}
                                className="h-[38px] w-[38px] rounded-lg border border-gray-200 bg-white hover:bg-red-50 text-[#7A0808] hover:border-red-200 flex items-center justify-center transition-colors shadow-sm flex-shrink-0"
                                title="Add New College"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-gray-700">
                        <input
                          type="checkbox"
                          checked={form.useCustomAccess}
                          onChange={(e) => updateUserField(index, 'useCustomAccess', e.target.checked)}
                        />
                        Customize access for this person (override role defaults)
                      </label>

                      <div className={form.useCustomAccess ? '' : 'opacity-50 pointer-events-none'}>
                        <label className="form-label">Access & navigation</label>
                        <PermissionCheckboxGrid
                          permissions={form.permissions}
                          navKeys={form.navKeys}
                          onChange={({ permissions, navKeys }) => {
                            setUsersList((prev) => {
                              const updated = [...prev];
                              updated[index] = { ...updated[index], permissions, navKeys };
                              return updated;
                            });
                          }}
                          disabled={!form.useCustomAccess}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Button to Add Another Person */}
            <button
              type="button"
              onClick={handleAddPerson}
              className="w-full mt-4 py-3 border-2 border-dashed border-[#7A0808] text-[#7A0808] hover:bg-red-50/50 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Plus size={16} /> Add Another Person
            </button>

            <div className="flex gap-3 mt-8">
              <button type="button" className="btn-outline-maroon flex-1 justify-center py-2.5" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-maroon flex-1 justify-center py-2.5">
                {usersList.length > 1 ? `Save ${usersList.length} Users` : 'Save User'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Nested Add Role Modal */}
      {showAddRoleModal && (
        <AddRoleModal
          onClose={() => {
            setShowAddRoleModal(false);
            setActiveRoleModalUserIndex(null);
          }}
          onSave={handleRoleCreated}
          existingRoles={roleDefinitionsList}
        />
      )}

      {/* Nested Add College Modal */}
      {showAddCollegeModal && (
        <AddCollegeModal
          onClose={() => {
            setShowAddCollegeModal(false);
            setActiveCollegeModalUserIndex(null);
          }}
          onSaveSuccess={handleCollegeCreated}
          colleges={colleges}
        />
      )}
    </>
  );
}
