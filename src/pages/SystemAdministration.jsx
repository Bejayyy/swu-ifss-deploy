import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Plus, MoreVertical, Shield, UserCog, Users, Building2, KeyRound, Trash2, Pencil, Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import Layout from '../components/Layout';
import ProgressStatCards from '../components/ProgressStatCards';
import AddUserModal from '../components/modals/AddUserModal';
import UserFilterModal from '../components/modals/UserFilterModal';
import UserActionsModal from '../components/modals/UserActionsModal';
import EditUserModal from '../components/modals/EditUserModal';
import ViewUserModal from '../components/modals/ViewUserModal';
import RoleAccessModal from '../components/modals/RoleAccessModal';
import AddRoleModal from '../components/modals/AddRoleModal';
import LoadingModal from '../components/modals/LoadingModal';
import CustomSelect from '../components/ui/CustomSelect';
import { ModalRenderer } from '../components/modals/ModalProvider';
import { useAuth } from '../context/AuthContext';
import { useRoleConfig } from '../context/RoleConfigContext';
import { useModal } from '../hooks/useModal';
import {
  createStaffUserByEmailInvite,
  subscribeStaffUsers,
  updateStaffUser,
  deleteStaffUser,
} from '../services/systemUserService';
import {
  deleteRoleDefinition,
  getRoleOptionsFromDefinitions,
  saveRoleDefinition,
} from '../services/roleDefinitionService';

const roleStyle = (role) => {
  const r = (role || '').toLowerCase();
  if (r.includes('admin') || r.includes('registrar') || r.includes('dean')) return 'bg-sky-100 text-sky-900';
  if (r.includes('teacher')) return 'bg-emerald-100 text-emerald-900';
  if (r.includes('head')) return 'bg-violet-100 text-violet-900';
  return 'bg-gray-100 text-gray-800';
};

export default function SystemAdministration() {
  const { profile } = useAuth();
  const { roleDefinitionsList, roleDefinitions, loading: rolesLoading, error: rolesError } = useRoleConfig();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filter, setFilter] = useState({ role: 'Any', status: 'Any' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [actionUser, setActionUser] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [editRole, setEditRole] = useState(null);
  const [showAddRole, setShowAddRole] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');

  const roleValues = useMemo(
    () => roleDefinitionsList.map((r) => r.id),
    [roleDefinitionsList],
  );

  const roleOptions = useMemo(
    () => getRoleOptionsFromDefinitions(roleDefinitionsList),
    [roleDefinitionsList],
  );

  useEffect(() => {
    if (!roleValues.length) return undefined;
    const unsub = subscribeStaffUsers(
      (list) => {
        setUsers(list);
        setLoadError('');
      },
      (err) => setLoadError(err.message || 'Failed to load users.'),
      roleValues,
      roleDefinitions,
    );
    return unsub;
  }, [roleValues, roleDefinitions]);

  const addUser = async (formOrArray) => {
    const usersToAdd = Array.isArray(formOrArray) ? formOrArray : [formOrArray];
    setIsLoading(true);
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < usersToAdd.length; i++) {
      const form = usersToAdd[i];
      setLoadingMessage(
        usersToAdd.length > 1
          ? `Creating user ${i + 1} of ${usersToAdd.length}: ${form.name}...`
          : 'Creating user...'
      );
      try {
        await createStaffUserByEmailInvite(
          {
            name: form.name,
            email: form.email,
            department: form.department,
            college: form.college,
            roleValue: form.role,
            permissions: form.permissions,
            navKeys: form.navKeys,
          },
          profile?.uid,
        );
        successCount++;
      } catch (error) {
        failCount++;
        errors.push(`${form.email}: ${error.message || 'Failed to create'}`);
      }
    }

    if (successCount > 0) {
      showNotification({
        type: 'success',
        title: successCount > 1 ? 'Bulk creation complete' : 'User added',
        message:
          successCount > 1
            ? `Successfully created ${successCount} user accounts. Welcome/credential emails have been sent.`
            : `${usersToAdd[0].name} has been added successfully. Welcome email sent.`,
        autoCloseMs: 3000,
      });
      setShowAdd(false);
    }

    if (failCount > 0) {
      showNotification({
        type: 'error',
        title: `${failCount} account(s) failed`,
        message: errors.join('\n'),
        autoCloseMs: 0,
      });
    }

    setIsLoading(false);
  };

  const saveUserEdits = async (payload) => {
    const confirmed = await showConfirm({
      title: 'Save changes?',
      message: `Update user information for ${payload.name}?`,
      confirmText: 'Save changes',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Updating user...');
    setSavingUser(true);
    
    try {
      await updateStaffUser(payload);
      showNotification({
        type: 'success',
        title: 'User updated',
        message: 'User information has been updated successfully.',
      });
      setEditUser(null);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Update failed',
        message: error.message || 'Failed to update user information.',
      });
    } finally {
      setSavingUser(false);
      setIsLoading(false);
    }
  };

  const saveRoleAccess = async (payload) => {
    const confirmed = await showConfirm({
      title: 'Update role access?',
      message: `This will affect all users with the "${payload.label}" role who don't have custom access.`,
      confirmText: 'Update role',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Updating role access...');
    setSavingRole(true);
    
    try {
      await saveRoleDefinition(payload);
      showNotification({
        type: 'success',
        title: 'Role updated',
        message: `"${payload.label}" role access has been updated.`,
      });
      setEditRole(null);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Update failed',
        message: error.message || 'Failed to update role access.',
      });
    } finally {
      setSavingRole(false);
      setIsLoading(false);
    }
  };

  const createRole = async (payloadOrArray) => {
    const rolesToAdd = Array.isArray(payloadOrArray) ? payloadOrArray : [payloadOrArray];
    setIsLoading(true);
    setSavingRole(true);
    let successCount = 0;
    let lastKey = '';
    const errors = [];

    for (let i = 0; i < rolesToAdd.length; i++) {
      const payload = rolesToAdd[i];
      setLoadingMessage(
        rolesToAdd.length > 1
          ? `Creating role ${i + 1} of ${rolesToAdd.length}: ${payload.label}...`
          : 'Creating role...'
      );
      try {
        lastKey = await saveRoleDefinition(payload, roleDefinitionsList);
        successCount++;
      } catch (error) {
        errors.push(`${payload.label}: ${error.message || 'Failed to create'}`);
      }
    }

    if (successCount > 0) {
      showNotification({
        type: 'success',
        title: successCount > 1 ? 'Bulk roles created' : 'Role created',
        message:
          successCount > 1
            ? `Successfully created ${successCount} custom roles.`
            : `"${rolesToAdd[0].label}" role has been created successfully.`,
        autoCloseMs: 3000,
      });
      setShowAddRole(false);
    }

    if (errors.length > 0) {
      showNotification({
        type: 'error',
        title: 'Role creation issue',
        message: errors.join('\n'),
        autoCloseMs: 0,
      });
    }

    setSavingRole(false);
    setIsLoading(false);
    return lastKey;
  };

  const removeRole = async (role) => {
    if (role.isSystem) {
      showNotification({
        type: 'warning',
        title: 'Cannot delete',
        message: 'Built-in roles cannot be deleted.',
      });
      return;
    }

    const inUse = users.some((u) => u.roleValue === role.id);
    if (inUse) {
      showNotification({
        type: 'warning',
        title: 'Role in use',
        message: 'Cannot delete a role that is assigned to users. Reassign those users first.',
      });
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete role?',
      message: `Are you sure you want to delete "${role.label}"? This action cannot be undone.`,
      confirmText: 'Delete role',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Deleting role...');
    
    try {
      await deleteRoleDefinition(role.id);
      showNotification({
        type: 'success',
        title: 'Role deleted',
        message: `"${role.label}" has been deleted successfully.`,
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Deletion failed',
        message: err.message || 'Failed to delete role.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (user) => {
    const confirmed = await showConfirm({
      title: 'Delete user?',
      message: `Are you sure you want to delete "${user.name}"? This will remove their access to the system.`,
      confirmText: 'Delete user',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    setLoadingMessage('Deleting user...');
    
    try {
      await deleteStaffUser(user.uid);
      showNotification({
        type: 'success',
        title: 'User deleted',
        message: `${user.name} has been removed from the system.`,
      });
      setActionUser(null);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Delete failed',
        message: error.message || 'Failed to delete user.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    setSelectedUserIds([]);
  }, [filter, searchQuery]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filter.role !== 'Any' && u.roleValue !== filter.role) return false;
      if (filter.status !== 'Any' && u.status !== filter.status) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        const matchDept = u.department?.toLowerCase().includes(q);
        const matchCollege = u.college?.toLowerCase().includes(q);
        const matchRole = u.role?.toLowerCase().includes(q);
        const matchStatus = u.status?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchDept && !matchCollege && !matchRole && !matchStatus) {
          return false;
        }
      }
      return true;
    });
  }, [users, filter, searchQuery]);

  const totalItems = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalItems);

  const toggleSelectUser = (uid) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const toggleSelectAll = () => {
    const pageUids = paginatedUsers.map((u) => u.uid);
    const allSelected = pageUids.length > 0 && pageUids.every((uid) => selectedUserIds.includes(uid));

    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !pageUids.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...pageUids])));
    }
  };

  const bulkDeleteSelectedUsers = async () => {
    if (selectedUserIds.length === 0) return;
    const count = selectedUserIds.length;
    const confirmed = await showConfirm({
      title: count > 1 ? `Delete ${count} users?` : 'Delete user?',
      message: count > 1
        ? `Are you sure you want to delete the ${count} selected users? This will remove their access to the system.`
        : `Are you sure you want to delete this user? This will remove their access to the system.`,
      confirmText: count > 1 ? `Delete ${count} users` : 'Delete user',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (let i = 0; i < selectedUserIds.length; i++) {
      const uid = selectedUserIds[i];
      const u = users.find((usr) => usr.uid === uid);
      const name = u?.name || uid;
      setLoadingMessage(`Deleting user ${i + 1} of ${count}: ${name}...`);
      try {
        await deleteStaffUser(uid);
        successCount++;
      } catch (error) {
        failCount++;
        errors.push(`${name}: ${error.message || 'Failed to delete'}`);
      }
    }

    if (successCount > 0) {
      showNotification({
        type: 'success',
        title: successCount > 1 ? `${successCount} users deleted` : 'User deleted',
        message: successCount > 1
          ? `Successfully removed ${successCount} users from the system.`
          : 'User has been removed from the system.',
      });
      setSelectedUserIds([]);
    }

    if (failCount > 0) {
      showNotification({
        type: 'error',
        title: `${failCount} deletion(s) failed`,
        message: errors.join('\n'),
      });
    }

    setIsLoading(false);
  };

  const deans = users.filter((u) => u.roleValue === 'dean').length;
  const teachers = users.filter((u) => u.roleValue === 'teacher').length;
  const customAccess = users.filter((u) => u.useCustomAccess).length;

  const stats = [
    { label: 'Total users', value: users.length, icon: Users, accent: 'total' },
    { label: 'Roles configured', value: roleDefinitionsList.length, icon: KeyRound, accent: 'approved' },
    { label: 'Deans', value: deans, icon: UserCog, accent: 'pending' },
    { label: 'Custom access users', value: customAccess, icon: Shield, accent: 'neutral' },
  ];

  return (
    <Layout title="User Management" subtitle="Manage users, roles, navigation access, and permissions">
      <ProgressStatCards items={stats} />

      {(loadError || rolesError) && (
        <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3 mt-4">
          {loadError || rolesError}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-6 mb-4">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-bold rounded-[10px] ${tab === 'users' ? 'btn-maroon' : 'btn-outline-maroon'}`}
          onClick={() => setTab('users')}
        >
          Users
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-bold rounded-[10px] ${tab === 'roles' ? 'btn-maroon' : 'btn-outline-maroon'}`}
          onClick={() => setTab('roles')}
        >
          Roles & access
        </button>
      </div>

      {tab === 'users' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative min-w-[220px] max-w-xs flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search name, email, role, department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-[10px] bg-white focus:outline-none focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808]"
                />
              </div>

              <button type="button" className="btn-maroon gap-2" style={{ borderRadius: 10 }} onClick={() => setShowFilter(true)}>
                <Filter size={16} /> Filter
              </button>

              {selectedUserIds.length > 0 && (
                <button
                  type="button"
                  className="btn-delete cursor-pointer"
                  onClick={bulkDeleteSelectedUsers}
                  title="Delete selected users"
                >
                  <Trash2 size={14} />
                  <span>Delete ({selectedUserIds.length})</span>
                </button>
              )}
            </div>

            <button type="button" className="btn-maroon gap-2" style={{ borderRadius: 10 }} onClick={() => setShowAdd(true)} disabled={rolesLoading}>
              <Plus size={16} /> Add user
            </button>
          </div>

          {(filter.role !== 'Any' || filter.status !== 'Any' || searchQuery.trim()) && (
            <p className="text-xs font-semibold mb-2" style={{ color: '#7A0808' }}>
              Filtered: {filter.role} · {filter.status}
              {searchQuery.trim() ? ` · Search: "${searchQuery}"` : ''} ({filteredUsers.length} shown)
            </p>
          )}

          <div className="bg-white rounded-[10px] shadow-md border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={paginatedUsers.length > 0 && paginatedUsers.every((u) => selectedUserIds.includes(u.uid))}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Name</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Email</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Role</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>Access</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider" style={{ color: '#2B3235' }}>College/Dept</th>
                    <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider text-center" style={{ color: '#2B3235' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs font-semibold text-gray-500">
                        No users found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map((u) => {
                      const isSelected = selectedUserIds.includes(u.uid);
                      return (
                        <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${isSelected ? 'bg-red-50/20' : ''}`}>
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectUser(u.uid)}
                              className="w-4 h-4 rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-9 h-9 flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: '#7A0808', borderRadius: 10 }}>
                                {u.initials}
                              </div>
                              <span className="font-bold" style={{ color: '#2B3235' }}>{u.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-medium" style={{ color: '#2B3235', opacity: 0.85 }}>{u.email}</td>
                          <td className="py-3 px-4">
                            <span className={`text-[10px] font-black px-2.5 py-1 uppercase rounded-full ${roleStyle(u.role)}`}>{u.role}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] font-bold px-2 py-1 rounded-full border border-gray-200" style={{ color: '#2B3235' }}>
                              {u.useCustomAccess ? 'Custom' : 'Role default'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium" style={{ color: '#2B3235', opacity: 0.8 }}>{u.department}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                className="p-1.5 text-gray-500 hover:text-[#7A0808] hover:bg-gray-100 rounded-lg transition-colors"
                                title="View & Edit Details"
                                onClick={() => setViewUser(u)}
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                type="button"
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Delete User"
                                onClick={() => deleteUser(u)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-gray-100 text-xs font-semibold text-gray-600">
              <div>
                Showing <span className="font-bold text-gray-800">{startIndex}</span> to{' '}
                <span className="font-bold text-gray-800">{endIndex}</span> of{' '}
                <span className="font-bold text-gray-800">{totalItems}</span> users
                {selectedUserIds.length > 0 && (
                  <span className="ml-2 text-[#7A0808] font-bold">({selectedUserIds.length} selected)</span>
                )}
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 min-w-[120px]">
                  <span>Rows per page:</span>
                  <CustomSelect
                    size="sm"
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    options={[
                      { value: 5, label: '5' },
                      { value: 10, label: '10' },
                      { value: 20, label: '20' },
                      { value: 50, label: '50' },
                    ]}
                    placeholder="Rows"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition-colors"
                  >
                    <ChevronLeft size={15} /> Prev
                  </button>

                  {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, i, arr) => {
                      const prev = arr[i - 1];
                      const showEllipsis = prev && p - prev > 1;

                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span className="px-1 text-gray-400">...</span>}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(p)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                              currentPage === p
                                ? 'bg-[#7A0808] text-white'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1 transition-colors"
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'roles' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-xs font-medium" style={{ color: '#2B3235', opacity: 0.7 }}>
              Configure default navigation and permissions for each role. Users inherit these unless given custom access.
            </p>
            <button type="button" className="btn-maroon gap-2" style={{ borderRadius: 10 }} onClick={() => setShowAddRole(true)}>
              <Plus size={16} /> Add role
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {roleDefinitionsList.map((role) => (
              <div key={role.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-black text-base" style={{ color: '#2B3235' }}>{role.label}</p>
                    <p className="text-[10px] font-semibold uppercase opacity-50 mt-0.5">{role.id}</p>
                  </div>
                  {role.isSystem && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-900">Built-in</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-4 text-[10px] font-bold" style={{ color: '#2B3235' }}>
                  <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                    {role.navKeys?.length || 0} nav items
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                    {role.permissions?.length || 0} permissions
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                    {users.filter((u) => u.roleValue === role.id).length} user(s)
                  </span>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-maroon text-xs flex-1 justify-center py-2 gap-1" onClick={() => setEditRole(role)}>
                    <Pencil size={12} /> Edit access
                  </button>
                  {!role.isSystem && (
                    <button type="button" className="btn-outline-maroon text-xs px-3 py-2" onClick={() => removeRole(role)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onSave={addUser}
          roleOptions={roleOptions}
          roleDefinitions={roleDefinitions}
          roleDefinitionsList={roleDefinitionsList}
          onSaveRole={createRole}
        />
      )}
      {showFilter && (
        <UserFilterModal
          onClose={() => setShowFilter(false)}
          onApply={setFilter}
          initialRole={filter.role}
          initialStatus={filter.status}
          roleOptions={roleOptions}
        />
      )}
      {actionUser && (
        <UserActionsModal
          user={actionUser}
          onClose={() => setActionUser(null)}
          onEdit={setEditUser}
          onDelete={deleteUser}
        />
      )}
      {viewUser && (
        <ViewUserModal
          user={viewUser}
          roleDefinitionsList={roleDefinitionsList}
          roleDefinitions={roleDefinitions}
          onClose={() => setViewUser(null)}
          onSave={saveUserEdits}
          saving={savingUser}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          roleDefinitionsList={roleDefinitionsList}
          roleDefinitions={roleDefinitions}
          onClose={() => setEditUser(null)}
          onSave={saveUserEdits}
          saving={savingUser}
        />
      )}
      {editRole && (
        <RoleAccessModal
          role={editRole}
          onClose={() => setEditRole(null)}
          onSave={saveRoleAccess}
          saving={savingRole}
        />
      )}
      {showAddRole && (
        <AddRoleModal
          onClose={() => setShowAddRole(false)}
          onSave={createRole}
          saving={savingRole}
          existingRoles={roleDefinitionsList}
        />
      )}

      <LoadingModal isOpen={isLoading} message={loadingMessage} />
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </Layout>
  );
}
